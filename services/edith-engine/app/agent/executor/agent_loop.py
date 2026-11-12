from typing import List, Dict, Any, Optional, AsyncGenerator
from pydantic import BaseModel, Field

from app.agent.planner.decomposer import TaskDecomposer
from app.agent.policies.gateway import CommandPolicyGateway
from app.patching.diff_generator import DiffEngine
from app.repository.indexer import RepositoryIndexer, IndexedFile


class AgentStep(BaseModel):
    step_id: str
    phase: str  # "thinking" | "tool_call" | "tool_result" | "patch_proposal" | "complete"
    title: str
    detail: str = ""
    tool_name: Optional[str] = None
    tool_args: Dict[str, Any] = Field(default_factory=dict)
    tool_output: Optional[str] = None
    diff_text: Optional[str] = None
    file_path: Optional[str] = None
    original_content: Optional[str] = None
    modified_content: Optional[str] = None
    is_mock: bool = False
    status: str = "completed"  # "pending" | "running" | "completed" | "failed"


class EdithCodingAgent:
    """Workspace-aware coding workflow coordinator backed by real Indexer, DiffEngine & PolicyGateway."""

    def __init__(self, indexer: Optional[RepositoryIndexer] = None):
        self.decomposer = TaskDecomposer()
        self.policy_gateway = CommandPolicyGateway()
        self.diff_engine = DiffEngine()
        self.indexer = indexer or RepositoryIndexer()

    def _select_target_file(
        self,
        prompt: str,
        indexed_files: List[IndexedFile],
        requested_target: Optional[str],
    ) -> Optional[str]:
        if requested_target:
            return requested_target

        keywords = [w.lower() for w in prompt.split() if len(w) > 3]
        for item in indexed_files:
            lower_path = item.relative_path.lower()
            if any(k in lower_path for k in keywords) and item.extension in (".py", ".js", ".jsx", ".ts", ".tsx"):
                return item.relative_path

        for item in indexed_files:
            if item.extension in (".py", ".js", ".jsx", ".ts", ".tsx"):
                return item.relative_path
        return indexed_files[0].relative_path if indexed_files else None

    async def execute_task_stream(
        self,
        prompt: str,
        workspace_root: Optional[str] = None,
        target_file: Optional[str] = None,
    ) -> AsyncGenerator[AgentStep, None]:
        resolved_root = str(self.indexer.resolve_workspace_root(workspace_root))
        step_idx = 1

        # 1. Task decomposition (honest preview without LLM key)
        plan = self.decomposer.decompose(goal=prompt, workspace_root=resolved_root)
        yield AgentStep(
            step_id=f"step_{step_idx}",
            phase="thinking",
            title=f"Plan Decomposed ({plan.total_steps} steps)",
            detail=f"Prepared workflow plan #{plan.plan_id} for: '{prompt}'.",
            is_mock=True,
            status="completed",
        )
        step_idx += 1

        # 2. Real workspace scan via RepositoryIndexer
        indexed_files = self.indexer.scan_file_tree(resolved_root, max_files=60)
        total_symbols = sum(len(f.symbols) for f in indexed_files)
        yield AgentStep(
            step_id=f"step_{step_idx}",
            phase="tool_result",
            title=f"Workspace Indexed: {len(indexed_files)} files, {total_symbols} AST symbols",
            tool_name="indexer.scan_file_tree",
            tool_args={"workspace_root": resolved_root, "max_files": 60},
            tool_output=f"Scanned {len(indexed_files)} files ({total_symbols} Python AST symbols).",
            detail=f"Scanned {len(indexed_files)} allowlisted files extracting {total_symbols} top-level AST symbols.",
            status="completed",
        )
        step_idx += 1

        # 3. Inspect real target file & synthesize verified unified diff preview
        chosen_file = self._select_target_file(prompt, indexed_files, target_file)
        if chosen_file:
            file_data = self.indexer.read_workspace_file(resolved_root, chosen_file)
            orig_content = file_data["content"]
            yield AgentStep(
                step_id=f"step_{step_idx}",
                phase="tool_result",
                title=f"Inspected: {chosen_file} ({file_data['size_bytes']} B)",
                tool_name="indexer.read_workspace_file",
                tool_args={"path": chosen_file},
                tool_output=f"Checksum SHA-256: {file_data['checksum'][:16]}...",
                detail=f"Loaded real workspace file {chosen_file} for diff synthesis.",
                status="completed",
            )
            step_idx += 1

            # Synthesize a non-destructive preview annotation diff and round-trip verify with apply_patch
            comment_prefix = "#" if chosen_file.endswith(".py") else "//"
            preview_note = f"{comment_prefix} [E.D.I.T.H. Preview Note]: Task '{prompt[:60]}'"
            mod_content = (
                orig_content
                if orig_content.startswith(preview_note)
                else f"{preview_note}\n{orig_content}"
            )
            diff_res = self.diff_engine.generate_diff(chosen_file, orig_content, mod_content)
            # Self-check patch applicability before proposing
            verified_patched = self.diff_engine.apply_patch(orig_content, diff_res.diff_text)
            if verified_patched != mod_content:
                raise ValueError("Generated patch failed self-verification round trip.")

            yield AgentStep(
                step_id=f"step_{step_idx}",
                phase="patch_proposal",
                title=f"Patch Preview Ready: {chosen_file}",
                detail=(
                    f"[Simulated Patch Preview] Generated {diff_res.hunks_count} verified hunk(s) "
                    f"for {chosen_file}. Open Diff Review to inspect or apply cleanly."
                ),
                diff_text=diff_res.diff_text,
                file_path=chosen_file,
                original_content=orig_content,
                modified_content=mod_content,
                is_mock=True,
                status="completed",
            )
            step_idx += 1

        # 4. Real Policy Gateway classification for verification command (no fabricated test passes)
        verify_cmd = "npm test" if "npm" in prompt.lower() else "pytest"
        policy = self.policy_gateway.evaluate(verify_cmd)
        yield AgentStep(
            step_id=f"step_{step_idx}",
            phase="tool_result",
            title=f"Verification Policy: {policy.decision}",
            tool_name="policy_gateway.evaluate",
            tool_args={"command": verify_cmd},
            tool_output=f"Command `{verify_cmd}` classified as {policy.decision} (risk {policy.risk_score}/100): {policy.reason}",
            detail=(
                f"Prepared verification command `{verify_cmd}` ({policy.decision}). "
                f"Run it explicitly in the Sandbox Terminal to execute live tests."
            ),
            status="pending",
        )
        step_idx += 1

        yield AgentStep(
            step_id=f"step_{step_idx}",
            phase="complete",
            title="Workflow Analysis Complete",
            detail=(
                f"Indexed {len(indexed_files)} workspace files and prepared a verified diff preview"
                + (f" for {chosen_file}." if chosen_file else ".")
                + " Configure a live coding model provider for autonomous multi-file edits."
            ),
            is_mock=True,
            status="completed",
        )

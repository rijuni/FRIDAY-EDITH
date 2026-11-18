from typing import List, Dict, Any, Optional, AsyncGenerator
from pydantic import BaseModel, Field

from app.agent.planner.decomposer import TaskDecomposer
from app.agent.policies.gateway import CommandPolicyGateway
from app.agent.executor.friday_ai_client import FridayAIClient
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
        self.ai_client = FridayAIClient()

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
        user_id: str = "",
        model: Optional[str] = None,
        use_ai: bool = False,
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
            tool_args={"max_files": 60},
            tool_output=f"Scanned {len(indexed_files)} files ({total_symbols} Python AST symbols).",
            detail=f"Scanned {len(indexed_files)} allowlisted files extracting {total_symbols} top-level AST symbols.",
            status="completed",
        )
        step_idx += 1

        # 3. Inspect a real target file and, only when requested, ask the provider for a patch.
        chosen_file = self._select_target_file(prompt, indexed_files, target_file)
        workflow_is_mock = True
        has_patch_proposal = False
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

            if not use_ai:
                yield AgentStep(
                    step_id=f"step_{step_idx}",
                    phase="tool_result",
                    title="AI proposal not requested",
                    detail="No provider was called and no mock code change was fabricated. Enable provider use to request a reviewable patch.",
                    tool_name="friday_ai.generate_code_proposal",
                    is_mock=True,
                    status="completed",
                )
                step_idx += 1
            else:
                try:
                    if not user_id:
                        raise ValueError("A scoped authenticated user is required for provider-backed code proposals.")
                    proposal = await self.ai_client.propose_file_change(
                        user_id=user_id,
                        prompt=prompt,
                        relative_path=chosen_file,
                        original_content=orig_content,
                        repository_paths=[item.relative_path for item in indexed_files],
                        model=model,
                    )
                    workflow_is_mock = proposal.is_mock
                    if proposal.is_mock:
                        yield AgentStep(
                            step_id=f"step_{step_idx}",
                            phase="tool_result",
                            title="Mock provider did not generate code",
                            detail="The configured provider is in mock mode. No code proposal was fabricated or applied.",
                            tool_name="friday_ai.generate_code_proposal",
                            is_mock=True,
                            status="completed",
                        )
                        step_idx += 1
                    else:
                        mod_content = proposal.modified_content
                        diff_res = self.diff_engine.generate_diff(chosen_file, orig_content, mod_content)
                        if diff_res.is_identical:
                            yield AgentStep(
                                step_id=f"step_{step_idx}",
                                phase="tool_result",
                                title="No code changes proposed",
                                detail=f"The model returned the original contents for {chosen_file}; no diff was created.",
                                tool_name="friday_ai.generate_code_proposal",
                                status="completed",
                            )
                            has_patch_proposal = True
                            step_idx += 1
                        else:
                            verified_patched = self.diff_engine.apply_patch(orig_content, diff_res.diff_text)
                            if verified_patched != mod_content:
                                raise ValueError("Generated patch failed self-verification round trip.")
                            yield AgentStep(
                                step_id=f"step_{step_idx}",
                                phase="patch_proposal",
                                title=f"Patch Preview Ready: {chosen_file}",
                                detail=(
                                    f"Model summary (unverified): {proposal.summary} Generated {diff_res.hunks_count} "
                                    f"round-trip-checked hunk(s) using {proposal.model}. This proposal has not been applied "
                                    "and no tests or commands were run."
                                ),
                                diff_text=diff_res.diff_text,
                                file_path=chosen_file,
                                original_content=orig_content,
                                modified_content=mod_content,
                                is_mock=False,
                                status="completed",
                            )
                            step_idx += 1
                except Exception:
                    yield AgentStep(
                        step_id=f"step_{step_idx}",
                        phase="tool_result",
                        title="Code proposal unavailable",
                        detail="The configured AI service could not produce a valid patch. No workspace files were changed.",
                        tool_name="friday_ai.generate_code_proposal",
                        status="failed",
                    )
                    yield AgentStep(
                        step_id=f"step_{step_idx + 1}",
                        phase="complete",
                        title="Workflow Paused",
                        detail="Review the model configuration and try this task again. No code was written or executed.",
                        status="failed",
                    )
                    return

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
                f"Indexed {len(indexed_files)} workspace files. "
                + (
                    f"Prepared a review-only diff for {chosen_file}; it was not written to the workspace."
                    if has_patch_proposal
                    else "No patch was generated and no workspace files were changed."
                )
            ),
            is_mock=workflow_is_mock,
            status="completed",
        )

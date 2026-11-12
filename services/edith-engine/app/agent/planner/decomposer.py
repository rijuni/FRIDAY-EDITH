from typing import List, Optional
from pydantic import BaseModel, Field
import uuid


class ExecutionStep(BaseModel):
    id: str = Field(default_factory=lambda: f"step_{uuid.uuid4().hex[:8]}")
    order: int
    name: str
    action_type: str  # "inspect" | "patch" | "command" | "verify" | "checkpoint"
    description: str
    target_files: List[str] = Field(default_factory=list)
    command: str = ""
    status: str = "pending"


class DecomposedPlan(BaseModel):
    plan_id: str = Field(default_factory=lambda: f"plan_{uuid.uuid4().hex[:8]}")
    goal: str
    total_steps: int
    steps: List[ExecutionStep]
    estimated_tokens: int = 1500
    is_mock: bool = True


class TaskDecomposer:
    """Decomposes high-level engineering tasks into ordered deterministic execution steps."""

    def decompose(
        self,
        goal: str,
        workspace_root: str = "",
        target_files: Optional[List[str]] = None,
    ) -> DecomposedPlan:
        clean_goal = (goal or "").strip()
        files = [f for f in (target_files or []) if f][:10]
        steps: List[ExecutionStep] = []
        lower_goal = clean_goal.lower()

        steps.append(
            ExecutionStep(
                order=1,
                name="Survey Context & Index Symbols",
                action_type="inspect",
                description=f"Inspect repository AST structure and symbols relevant to: {clean_goal}",
                target_files=files,
            )
        )

        steps.append(
            ExecutionStep(
                order=2,
                name="Synthesize Code Modifications",
                action_type="patch",
                description="Draft hunk patches and verify unified diffs against target files",
                target_files=files,
            )
        )

        if any(w in lower_goal for w in ["test", "build", "verify", "run", "fix", "refactor", "audit"]):
            steps.append(
                ExecutionStep(
                    order=len(steps) + 1,
                    name="Execute Automated Verification in Isolated Runner",
                    action_type="verify",
                    description="Evaluate verification command via Policy Gateway before running in isolated runner",
                    command="npm test" if "npm" in lower_goal or "web" in lower_goal else "pytest",
                )
            )

        steps.append(
            ExecutionStep(
                order=len(steps) + 1,
                name="Diff Review & Human-in-the-Loop Checkpoint",
                action_type="checkpoint",
                description="Present verified unified diff and audit trail for explicit developer approval",
                target_files=files,
            )
        )

        return DecomposedPlan(
            goal=clean_goal,
            total_steps=len(steps),
            steps=steps,
            is_mock=True,
        )

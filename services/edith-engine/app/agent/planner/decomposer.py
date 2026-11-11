from typing import List, Dict, Any
from pydantic import BaseModel, Field
import uuid

class ExecutionStep(BaseModel):
    id: str = Field(default_factory=lambda: f"step_{uuid.uuid4().hex[:8]}")
    order: int
    name: str
    action_type: str  # "inspect" | "patch" | "command" | "verify"
    description: str
    target_files: List[str] = Field(default_factory=list)
    command: str = ""
    status: str = "pending"  # "pending" | "running" | "completed" | "failed"

class DecomposedPlan(BaseModel):
    plan_id: str = Field(default_factory=lambda: f"plan_{uuid.uuid4().hex[:8]}")
    goal: str
    total_steps: int
    steps: List[ExecutionStep]
    estimated_tokens: int = 1500

class TaskDecomposer:
    """Decomposes high-level engineering tasks into ordered deterministic execution steps."""

    def decompose(self, goal: str, workspace_root: str = "") -> DecomposedPlan:
        steps: List[ExecutionStep] = []
        lower_goal = goal.lower()

        # Step 1: Always survey/inspect context
        steps.append(
            ExecutionStep(
                order=1,
                name="Survey Context & Index Symbols",
                action_type="inspect",
                description=f"Inspect repository AST structure and symbols relevant to: {goal}",
                target_files=[]
            )
        )

        # Step 2: Code patching / generation step
        steps.append(
            ExecutionStep(
                order=2,
                name="Synthesize Code Modifications",
                action_type="patch",
                description="Draft hunk patches and generate unified diffs",
                target_files=[]
            )
        )

        # Step 3: Command execution / tests (if test/build implied)
        if any(w in lower_goal for w in ["test", "build", "verify", "run", "fix", "refactor"]):
            steps.append(
                ExecutionStep(
                    order=3,
                    name="Execute Automated Verification in Isolated Runner",
                    action_type="verify",
                    description="Run test suite and verify zero regression in runner sandbox",
                    command="npm test" if "npm" in lower_goal else "pytest"
                )
            )

        # Step 4: Review and approval checkpoint
        steps.append(
            ExecutionStep(
                order=len(steps) + 1,
                name="Audit Log & Human-in-the-Loop Checkpoint",
                action_type="checkpoint",
                description="Package unified diff and audit trail for developer review",
                target_files=[]
            )
        )

        return DecomposedPlan(
            goal=goal,
            total_steps=len(steps),
            steps=steps
        )


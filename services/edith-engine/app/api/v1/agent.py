from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.agent.planner.decomposer import TaskDecomposer, DecomposedPlan
from app.agent.policies.gateway import CommandPolicyGateway, PolicyDecision
from app.patching.diff_generator import DiffEngine, UnifiedDiffResult
from app.repository.indexer import RepositoryIndexer, IndexedFile
from app.agent.executor.agent_loop import EdithCodingAgent, AgentStep
from app.core.config import settings

router = APIRouter()
decomposer = TaskDecomposer()
policy_gateway = CommandPolicyGateway()
diff_engine = DiffEngine()
repo_indexer = RepositoryIndexer()
coding_agent = EdithCodingAgent()

class AgentRunRequest(BaseModel):
    prompt: str
    workspace_root: Optional[str] = None

class PlanRequest(BaseModel):
    goal: str
    workspace_root: Optional[str] = None

class PolicyEvaluateRequest(BaseModel):
    command: str

class DiffRequest(BaseModel):
    file_path: str
    original_content: str
    modified_content: str

class RepoScanRequest(BaseModel):
    workspace_root: Optional[str] = None
    max_files: Optional[int] = 100

@router.post("/plan", response_model=DecomposedPlan)
async def create_plan(req: PlanRequest):
    root = req.workspace_root or settings.DEFAULT_WORKSPACE_DIR
    return decomposer.decompose(goal=req.goal, workspace_root=root)

@router.post("/policies/evaluate", response_model=PolicyDecision)
async def evaluate_policy(req: PolicyEvaluateRequest):
    return policy_gateway.evaluate(command=req.command)

@router.post("/diff/generate", response_model=UnifiedDiffResult)
async def generate_diff(req: DiffRequest):
    return diff_engine.generate_diff(
        file_path=req.file_path,
        original_content=req.original_content,
        modified_content=req.modified_content
    )

@router.post("/repository/scan", response_model=List[IndexedFile])
async def scan_repository(req: RepoScanRequest):
    root = req.workspace_root or settings.DEFAULT_WORKSPACE_DIR
    return repo_indexer.scan_file_tree(root_dir=root, max_files=req.max_files or 100)

@router.post("/run", response_model=List[AgentStep])
async def run_agent_task(req: AgentRunRequest):
    steps = []
    async for step in coding_agent.execute_task_stream(req.prompt):
        steps.append(step)
    return steps


from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agent.executor.agent_loop import AgentStep, EdithCodingAgent
from app.agent.planner.decomposer import DecomposedPlan, TaskDecomposer
from app.agent.policies.gateway import CommandPolicyGateway, PolicyDecision
from app.core.auth import verify_internal_caller
from app.core.config import settings
from app.core.errors import PatchApplyException
from app.patching.diff_generator import DiffEngine, PatchApplyResult, UnifiedDiffResult
from app.repository.indexer import IndexedFile, RepositoryIndexer

router = APIRouter(dependencies=[Depends(verify_internal_caller)])

decomposer = TaskDecomposer()
policy_gateway = CommandPolicyGateway()
diff_engine = DiffEngine()
repo_indexer = RepositoryIndexer()
coding_agent = EdithCodingAgent(indexer=repo_indexer)


class AgentRunRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=settings.MAX_PROMPT_LENGTH)
    workspace_root: Optional[str] = Field(default=None, max_length=512)
    target_file: Optional[str] = Field(default=None, max_length=512)


class PlanRequest(BaseModel):
    goal: str = Field(..., min_length=1, max_length=settings.MAX_PROMPT_LENGTH)
    workspace_root: Optional[str] = Field(default=None, max_length=512)
    target_files: Optional[List[str]] = None


class PolicyEvaluateRequest(BaseModel):
    command: str = Field(..., min_length=1, max_length=settings.MAX_COMMAND_LENGTH)


class DiffRequest(BaseModel):
    file_path: str = Field(..., min_length=1, max_length=512)
    original_content: str = Field(..., max_length=settings.MAX_CONTENT_BYTES)
    modified_content: str = Field(..., max_length=settings.MAX_CONTENT_BYTES)


class DiffApplyRequest(BaseModel):
    original_content: str = Field(..., max_length=settings.MAX_CONTENT_BYTES)
    patch_text: str = Field(..., max_length=settings.MAX_CONTENT_BYTES)


class RepoScanRequest(BaseModel):
    workspace_root: Optional[str] = Field(default=None, max_length=512)
    max_files: int = Field(default=100, ge=1, le=settings.MAX_SCAN_FILES)


class RepoScanResponse(BaseModel):
    workspace_root: str
    total_files: int
    total_symbols: int
    files: List[IndexedFile]


class FileReadRequest(BaseModel):
    relative_path: str = Field(..., min_length=1, max_length=512)
    workspace_root: Optional[str] = Field(default=None, max_length=512)


class FileReadResponse(BaseModel):
    relative_path: str
    content: str
    size_bytes: int
    checksum: str


@router.post("/plan", response_model=DecomposedPlan)
async def create_plan(req: PlanRequest):
    resolved = str(repo_indexer.resolve_workspace_root(req.workspace_root))
    return decomposer.decompose(
        goal=req.goal,
        workspace_root=resolved,
        target_files=req.target_files,
    )


@router.post("/policies/evaluate", response_model=PolicyDecision)
async def evaluate_policy(req: PolicyEvaluateRequest):
    return policy_gateway.evaluate(command=req.command)


@router.post("/diff/generate", response_model=UnifiedDiffResult)
async def generate_diff(req: DiffRequest):
    return diff_engine.generate_diff(
        file_path=req.file_path,
        original_content=req.original_content,
        modified_content=req.modified_content,
    )


@router.post("/diff/apply", response_model=PatchApplyResult)
async def apply_diff(req: DiffApplyRequest):
    try:
        modified = diff_engine.apply_patch(
            original_content=req.original_content,
            patch_text=req.patch_text,
        )
    except ValueError as exc:
        raise PatchApplyException(str(exc)) from exc

    hunks_applied = sum(
        1 for line in req.patch_text.splitlines() if line.startswith("@@")
    )
    return PatchApplyResult(
        original_checksum=diff_engine.compute_checksum(req.original_content),
        modified_checksum=diff_engine.compute_checksum(modified),
        modified_content=modified,
        hunks_applied=hunks_applied,
    )


@router.post("/repository/scan", response_model=RepoScanResponse)
async def scan_repository(req: RepoScanRequest):
    resolved = str(repo_indexer.resolve_workspace_root(req.workspace_root))
    files = repo_indexer.scan_file_tree(root_dir=resolved, max_files=req.max_files)
    total_symbols = sum(len(f.symbols) for f in files)
    return RepoScanResponse(
        workspace_root=resolved,
        total_files=len(files),
        total_symbols=total_symbols,
        files=files,
    )


@router.post("/files/read", response_model=FileReadResponse)
async def read_workspace_file(req: FileReadRequest):
    file_data = repo_indexer.read_workspace_file(
        root_dir=req.workspace_root,
        relative_path=req.relative_path,
    )
    return FileReadResponse(**file_data)


@router.post("/run", response_model=List[AgentStep])
async def run_agent_task(req: AgentRunRequest):
    steps: List[AgentStep] = []
    async for step in coding_agent.execute_task_stream(
        prompt=req.prompt,
        workspace_root=req.workspace_root,
        target_file=req.target_file,
    ):
        steps.append(step)
    return steps

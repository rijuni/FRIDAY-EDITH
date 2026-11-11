import pytest
from app.agent.planner.decomposer import TaskDecomposer
from app.agent.policies.gateway import CommandPolicyGateway
from app.patching.diff_generator import DiffEngine
from app.repository.indexer import RepositoryIndexer

def test_task_decomposer():
    decomposer = TaskDecomposer()
    plan = decomposer.decompose("Fix the login bug and run verification tests")
    assert plan.total_steps >= 3
    assert any(step.action_type == "verify" for step in plan.steps)
    assert any(step.action_type == "checkpoint" for step in plan.steps)

def test_policy_gateway_classification():
    gateway = CommandPolicyGateway()
    
    # Safe read-only commands
    decision = gateway.evaluate("git status")
    assert decision.decision == "SAFE"
    
    decision = gateway.evaluate("npm test")
    assert decision.decision == "SAFE"

    # Mutating commands requiring human confirmation
    decision = gateway.evaluate("npm install lodash")
    assert decision.decision == "CONFIRMATION_REQUIRED"

    decision = gateway.evaluate("git commit -m 'new feature'")
    assert decision.decision == "CONFIRMATION_REQUIRED"

    # Destructive / Prohibited commands
    decision = gateway.evaluate("rmdir /s /q C:\\Windows")
    assert decision.decision == "DENIED"

def test_diff_engine():
    diff_engine = DiffEngine()
    orig = "def hello():\n    return 'world'\n"
    mod = "def hello():\n    return 'EDITH'\n"
    
    result = diff_engine.generate_diff("test.py", orig, mod)
    assert not result.is_identical
    assert result.hunks_count > 0
    assert "-    return 'world'" in result.diff_text
    assert "+    return 'EDITH'" in result.diff_text

    # Identical content
    result_same = diff_engine.generate_diff("test.py", orig, orig)
    assert result_same.is_identical
    assert result_same.diff_text == ""

def test_repository_indexer(tmp_path):
    indexer = RepositoryIndexer()
    test_py = tmp_path / "sample.py"
    test_py.write_text("class StarkCorp:\n    def build_suit(self):\n        pass\n")

    files = indexer.scan_file_tree(str(tmp_path))
    assert len(files) == 1
    assert files[0].relative_path == "sample.py"
    assert any(s.name == "StarkCorp" and s.symbol_type == "class" for s in files[0].symbols)


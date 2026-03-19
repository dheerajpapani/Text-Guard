import time
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from config import (
    APP_ENV,
    APP_NAME,
    APP_VERSION,
    BLOCK_THRESHOLD,
    DEFAULT_WORKSPACE_ID,
    ENABLE_DEBUG_ENV,
    LOG,
    MOCK_MODE,
    REVIEW_THRESHOLD,
    WORKSPACE_SHARED_KEY,
)
from providers import (
    debug_env_payload,
    fetch_all_events,
    fetch_events,
    fetch_policy_presets,
    fetch_test_cases,
    log_event,
    provider_status,
    run_llm_moderation,
    save_event,
    save_test_case,
    upsert_policy_preset,
    update_event,
)
from rules import choose_action, detect_rule_signals, empty_categories, merge_categories, normalize_text


router = APIRouter()


class ModerateRequest(BaseModel):
    text: str = Field(..., min_length=0, max_length=5000)
    mode: str = Field(default="comment")


class ModerateResponse(BaseModel):
    action: str
    score: float
    reason: str
    matched_seed: Optional[str] = None
    categories: dict[str, float]
    flags: list[str]
    policy: dict[str, Any]
    provider: str
    model: Optional[str] = None
    mode: str
    latency_ms: int


class ReviewSubmissionRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    mode: str = Field(default="comment")
    scenario: str = Field(default="simulation")
    policy_preset: str = Field(default="default")
    notes: Optional[str] = None
    moderation_result: Optional[dict[str, Any]] = None


class ReviewDecisionRequest(BaseModel):
    decision: str = Field(..., pattern="^(resolved|approved_allow|confirmed_block)$")
    notes: Optional[str] = Field(default=None, max_length=300)
    reviewer: Optional[str] = Field(default="reviewer")


class ReviewAssignmentRequest(BaseModel):
    assignee: str = Field(..., min_length=1, max_length=120)
    reviewer: Optional[str] = Field(default="reviewer")


class TestCaseRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    text: str = Field(..., min_length=1, max_length=5000)
    mode: str = Field(default="comment")
    scenario: str = Field(default="simulation")
    policy_preset: str = Field(default="default")
    expected_action: str = Field(..., pattern="^(allow|review|block)$")
    notes: Optional[str] = Field(default=None, max_length=300)


class TestCaseImportRequest(BaseModel):
    cases: list[TestCaseRequest]


class PolicyPresetRequest(BaseModel):
    preset_id: str = Field(..., min_length=1, max_length=60)
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=300)
    review_threshold: float = Field(..., ge=0.0, le=1.0)
    block_threshold: float = Field(..., ge=0.0, le=1.0)


def resolve_workspace(
    workspace_id: Optional[str] = None,
    workspace_key: Optional[str] = None,
) -> str:
    resolved_id = (workspace_id or DEFAULT_WORKSPACE_ID).strip() or DEFAULT_WORKSPACE_ID
    expected_key = WORKSPACE_SHARED_KEY.strip()
    if expected_key and (workspace_key or "").strip() != expected_key:
        raise HTTPException(status_code=401, detail="Invalid workspace credentials")
    return resolved_id


@router.get("/")
def root() -> dict[str, Any]:
    return {"service": APP_NAME, "version": APP_VERSION, "environment": APP_ENV, "status": "ok"}


@router.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": APP_NAME,
        "environment": APP_ENV,
        "version": APP_VERSION,
        "providers": provider_status(),
        "mock_mode": MOCK_MODE,
        "time_utc": time.time(),
    }


@router.get("/_debug_env")
def debug_env() -> dict[str, Any]:
    if not ENABLE_DEBUG_ENV:
        raise HTTPException(status_code=404, detail="Not found")
    return debug_env_payload()


@router.post("/moderate", response_model=ModerateResponse)
def moderate(
    req: ModerateRequest,
    x_workspace_id: Optional[str] = Header(default=None, alias="X-Workspace-Id"),
    x_workspace_key: Optional[str] = Header(default=None, alias="X-Workspace-Key"),
) -> ModerateResponse:
    workspace_id = resolve_workspace(x_workspace_id, x_workspace_key)
    started = time.perf_counter()
    text = normalize_text(req.text or "")

    if text == "":
        latency_ms = round((time.perf_counter() - started) * 1000)
        return ModerateResponse(
            action="allow",
            score=0.0,
            reason="empty_text",
            matched_seed=None,
            categories=empty_categories(),
            flags=[],
            policy={"block_threshold": BLOCK_THRESHOLD, "review_threshold": REVIEW_THRESHOLD},
            provider="none",
            model=None,
            mode=req.mode,
            latency_ms=latency_ms,
        )

    if MOCK_MODE:
        latency_ms = round((time.perf_counter() - started) * 1000)
        return ModerateResponse(
            action="allow",
            score=0.05,
            reason="mock_mode",
            matched_seed=None,
            categories=empty_categories(),
            flags=["mock_mode"],
            policy={"block_threshold": BLOCK_THRESHOLD, "review_threshold": REVIEW_THRESHOLD},
            provider="mock",
            model=None,
            mode=req.mode,
            latency_ms=latency_ms,
        )

    rule_categories, flags, rule_match = detect_rule_signals(text)

    try:
        llm_categories, llm_match, provider, model = run_llm_moderation(text)
    except Exception as exc:
        LOG.warning("Model moderation failed: %s", exc)
        llm_categories, llm_match, provider, model = empty_categories(), None, "error", None
        flags = sorted(set([*flags, "model_error"]))

    categories = merge_categories(rule_categories, llm_categories)
    score = max(categories.values()) if categories else 0.0
    dominant_category = max(categories, key=categories.get) if categories else "other"
    latency_ms = round((time.perf_counter() - started) * 1000)

    response = ModerateResponse(
        action=choose_action(score),
        score=round(score, 4),
        reason=f"policy_{dominant_category}",
        matched_seed=rule_match or llm_match,
        categories=categories,
        flags=flags,
        policy={"block_threshold": BLOCK_THRESHOLD, "review_threshold": REVIEW_THRESHOLD},
        provider=provider,
        model=model,
        mode=req.mode,
        latency_ms=latency_ms,
    )

    payload = response.model_dump() if hasattr(response, "model_dump") else response.dict()
    log_event({"ts": int(time.time()), "workspace_id": workspace_id, "raw": text, **payload, "meta": {"environment": APP_ENV}})
    return response


@router.get("/admin/logs")
def get_admin_logs(
    limit: int = 50,
    action: Optional[str] = None,
    x_workspace_id: Optional[str] = Header(default=None, alias="X-Workspace-Id"),
    x_workspace_key: Optional[str] = Header(default=None, alias="X-Workspace-Key"),
) -> dict[str, Any]:
    workspace_id = resolve_workspace(x_workspace_id, x_workspace_key)
    try:
        items = fetch_events(limit=limit, action=action, workspace_id=workspace_id)
        return {"n": len(items), "results": items}
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        LOG.warning("Failed to fetch logs: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch logs") from exc


@router.post("/admin/review-submissions")
def create_review_submission(
    req: ReviewSubmissionRequest,
    x_workspace_id: Optional[str] = Header(default=None, alias="X-Workspace-Id"),
    x_workspace_key: Optional[str] = Header(default=None, alias="X-Workspace-Key"),
) -> dict[str, Any]:
    workspace_id = resolve_workspace(x_workspace_id, x_workspace_key)
    text = normalize_text(req.text or "")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    now = int(time.time())
    event = {
        "ts": now,
        "workspace_id": workspace_id,
        "raw": text,
        "action": "review",
        "review_status": "open",
        "score": float(req.moderation_result.get("score", 0.0)) if isinstance(req.moderation_result, dict) else 0.0,
        "reason": "manual_review_requested",
        "matched_seed": req.moderation_result.get("matched_seed") if isinstance(req.moderation_result, dict) else None,
        "categories": req.moderation_result.get("categories", empty_categories()) if isinstance(req.moderation_result, dict) else empty_categories(),
        "flags": sorted(
            set(
                [
                    "manual_submission",
                    *(
                        req.moderation_result.get("flags", [])
                        if isinstance(req.moderation_result, dict) and isinstance(req.moderation_result.get("flags"), list)
                        else []
                    ),
                ]
            )
        ),
        "policy": req.moderation_result.get("policy", {"block_threshold": BLOCK_THRESHOLD, "review_threshold": REVIEW_THRESHOLD})
        if isinstance(req.moderation_result, dict)
        else {"block_threshold": BLOCK_THRESHOLD, "review_threshold": REVIEW_THRESHOLD},
        "provider": req.moderation_result.get("provider", "manual") if isinstance(req.moderation_result, dict) else "manual",
        "model": req.moderation_result.get("model") if isinstance(req.moderation_result, dict) else None,
        "mode": req.mode,
        "latency_ms": req.moderation_result.get("latency_ms", 0) if isinstance(req.moderation_result, dict) else 0,
        "meta": {
            "environment": APP_ENV,
            "source": "simulation_lab",
            "scenario": req.scenario,
            "policy_preset": req.policy_preset,
            "notes": req.notes or "",
            "original_action": req.moderation_result.get("action") if isinstance(req.moderation_result, dict) else None,
        },
    }

    if not save_event(event):
        raise HTTPException(status_code=500, detail="Failed to save review submission")

    return {"ok": True, "saved_at": now, "event": event}


@router.post("/admin/logs/{event_id}/decision")
def apply_review_decision(
    event_id: str,
    req: ReviewDecisionRequest,
    x_workspace_id: Optional[str] = Header(default=None, alias="X-Workspace-Id"),
    x_workspace_key: Optional[str] = Header(default=None, alias="X-Workspace-Key"),
) -> dict[str, Any]:
    workspace_id = resolve_workspace(x_workspace_id, x_workspace_key)
    now = int(time.time())
    next_status = "resolved" if req.decision == "resolved" else "decided"
    action_override = None
    if req.decision == "approved_allow":
        action_override = "allow"
    elif req.decision == "confirmed_block":
        action_override = "block"

    updates: dict[str, Any] = {
        "review_status": next_status,
        "review": {
            "decision": req.decision,
            "notes": (req.notes or "").strip(),
            "reviewer": (req.reviewer or "reviewer").strip() or "reviewer",
            "reviewed_at": now,
        },
    }
    if action_override is not None:
        updates["action"] = action_override

    try:
        event = update_event(event_id, updates, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        LOG.warning("Failed to apply review decision: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to apply review decision") from exc

    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    return {"ok": True, "event": event}


@router.get("/admin/analytics")
def get_admin_analytics(
    limit: int = 500,
    x_workspace_id: Optional[str] = Header(default=None, alias="X-Workspace-Id"),
    x_workspace_key: Optional[str] = Header(default=None, alias="X-Workspace-Key"),
) -> dict[str, Any]:
    workspace_id = resolve_workspace(x_workspace_id, x_workspace_key)
    try:
        events = fetch_all_events(limit=limit, workspace_id=workspace_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        LOG.warning("Failed to load analytics: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load analytics") from exc

    status_counts = {"open": 0, "resolved": 0, "decided": 0}
    action_counts = {"allow": 0, "review": 0, "block": 0}
    category_counts: dict[str, int] = {}
    flag_counts: dict[str, int] = {}

    for event in events:
        action = event.get("action")
        if action in action_counts:
            action_counts[action] += 1

        status = event.get("review_status") or ("decided" if event.get("review") else "open" if action == "review" else "resolved")
        if status in status_counts:
            status_counts[status] += 1

        categories = event.get("categories") or {}
        if categories:
            top_category = max(categories, key=lambda key: float(categories.get(key, 0.0)))
            if float(categories.get(top_category, 0.0)) > 0:
                category_counts[top_category] = category_counts.get(top_category, 0) + 1

        for flag in event.get("flags") or []:
            flag_counts[flag] = flag_counts.get(flag, 0) + 1

    top_categories = sorted(category_counts.items(), key=lambda item: item[1], reverse=True)[:5]
    top_flags = sorted(flag_counts.items(), key=lambda item: item[1], reverse=True)[:5]

    trend = []
    per_day: dict[str, int] = {}
    for event in events:
        day = time.strftime("%Y-%m-%d", time.gmtime(event.get("ts", 0)))
        per_day[day] = per_day.get(day, 0) + 1
    for day, count in sorted(per_day.items())[-7:]:
        trend.append({"day": day, "count": count})

    return {
        "total_events": len(events),
        "status_counts": status_counts,
        "action_counts": action_counts,
        "top_categories": [{"name": name, "count": count} for name, count in top_categories],
        "top_flags": [{"name": name, "count": count} for name, count in top_flags],
        "trend": trend,
    }


@router.get("/admin/test-cases")
def get_saved_test_cases(
    limit: int = 100,
    x_workspace_id: Optional[str] = Header(default=None, alias="X-Workspace-Id"),
    x_workspace_key: Optional[str] = Header(default=None, alias="X-Workspace-Key"),
) -> dict[str, Any]:
    workspace_id = resolve_workspace(x_workspace_id, x_workspace_key)
    try:
        items = fetch_test_cases(limit=limit, workspace_id=workspace_id)
        return {"n": len(items), "results": items}
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        LOG.warning("Failed to fetch test cases: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch test cases") from exc


@router.post("/admin/test-cases")
def create_test_case(
    req: TestCaseRequest,
    x_workspace_id: Optional[str] = Header(default=None, alias="X-Workspace-Id"),
    x_workspace_key: Optional[str] = Header(default=None, alias="X-Workspace-Key"),
) -> dict[str, Any]:
    workspace_id = resolve_workspace(x_workspace_id, x_workspace_key)
    now = int(time.time())
    document = {
        "workspace_id": workspace_id,
        "title": req.title.strip(),
        "text": normalize_text(req.text or ""),
        "mode": req.mode,
        "scenario": req.scenario,
        "policy_preset": req.policy_preset,
        "expected_action": req.expected_action,
        "notes": (req.notes or "").strip(),
        "created_at": now,
        "meta": {"source": "simulation_lab", "environment": APP_ENV},
    }
    if not document["title"] or not document["text"]:
        raise HTTPException(status_code=400, detail="Title and text are required")

    try:
        saved = save_test_case(document)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        LOG.warning("Failed to save test case: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save test case") from exc

    if saved is None:
        raise HTTPException(status_code=500, detail="Failed to save test case")

    return {"ok": True, "test_case": saved}


@router.get("/admin/test-cases/export")
def export_test_cases(
    x_workspace_id: Optional[str] = Header(default=None, alias="X-Workspace-Id"),
    x_workspace_key: Optional[str] = Header(default=None, alias="X-Workspace-Key"),
) -> dict[str, Any]:
    workspace_id = resolve_workspace(x_workspace_id, x_workspace_key)
    try:
        items = fetch_test_cases(limit=1000, workspace_id=workspace_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        LOG.warning("Failed to export test cases: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to export test cases") from exc

    exported = []
    for item in items:
        exported.append(
            {
                "title": item.get("title", ""),
                "text": item.get("text", ""),
                "mode": item.get("mode", "comment"),
                "scenario": item.get("scenario", "simulation"),
                "policy_preset": item.get("policy_preset", "default"),
                "expected_action": item.get("expected_action", "review"),
                "notes": item.get("notes", ""),
            }
        )
    return {"workspace_id": workspace_id, "cases": exported}


@router.post("/admin/test-cases/import")
def import_test_cases(
    req: TestCaseImportRequest,
    x_workspace_id: Optional[str] = Header(default=None, alias="X-Workspace-Id"),
    x_workspace_key: Optional[str] = Header(default=None, alias="X-Workspace-Key"),
) -> dict[str, Any]:
    workspace_id = resolve_workspace(x_workspace_id, x_workspace_key)
    created = []
    for item in req.cases:
        now = int(time.time())
        document = {
            "workspace_id": workspace_id,
            "title": item.title.strip(),
            "text": normalize_text(item.text or ""),
            "mode": item.mode,
            "scenario": item.scenario,
            "policy_preset": item.policy_preset,
            "expected_action": item.expected_action,
            "notes": (item.notes or "").strip(),
            "created_at": now,
            "meta": {"source": "import", "environment": APP_ENV},
        }
        saved = save_test_case(document)
        if saved is not None:
            created.append(saved)
    return {"ok": True, "imported": len(created), "results": created}


@router.get("/admin/policy-presets")
def get_policy_presets(
    x_workspace_id: Optional[str] = Header(default=None, alias="X-Workspace-Id"),
    x_workspace_key: Optional[str] = Header(default=None, alias="X-Workspace-Key"),
) -> dict[str, Any]:
    workspace_id = resolve_workspace(x_workspace_id, x_workspace_key)
    try:
        items = fetch_policy_presets(workspace_id=workspace_id)
        return {"n": len(items), "results": items}
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        LOG.warning("Failed to fetch policy presets: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch policy presets") from exc


@router.post("/admin/policy-presets")
def upsert_preset(
    req: PolicyPresetRequest,
    x_workspace_id: Optional[str] = Header(default=None, alias="X-Workspace-Id"),
    x_workspace_key: Optional[str] = Header(default=None, alias="X-Workspace-Key"),
) -> dict[str, Any]:
    workspace_id = resolve_workspace(x_workspace_id, x_workspace_key)
    if req.block_threshold <= req.review_threshold:
        raise HTTPException(status_code=400, detail="Block threshold must be greater than review threshold")
    document = {
        "workspace_id": workspace_id,
        "preset_id": req.preset_id,
        "name": req.name.strip(),
        "description": req.description.strip(),
        "review_threshold": req.review_threshold,
        "block_threshold": req.block_threshold,
        "updated_at": int(time.time()),
    }
    try:
        saved = upsert_policy_preset(workspace_id, req.preset_id, document)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        LOG.warning("Failed to save policy preset: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save policy preset") from exc
    if saved is None:
        raise HTTPException(status_code=500, detail="Failed to save policy preset")
    return {"ok": True, "preset": saved}


@router.post("/admin/logs/{event_id}/assign")
def assign_review_owner(
    event_id: str,
    req: ReviewAssignmentRequest,
    x_workspace_id: Optional[str] = Header(default=None, alias="X-Workspace-Id"),
    x_workspace_key: Optional[str] = Header(default=None, alias="X-Workspace-Key"),
) -> dict[str, Any]:
    workspace_id = resolve_workspace(x_workspace_id, x_workspace_key)
    updates = {
        "review_status": "open",
        "review_assignment": {
            "assignee": req.assignee.strip(),
            "assigned_by": (req.reviewer or "reviewer").strip() or "reviewer",
            "assigned_at": int(time.time()),
        },
    }
    try:
        event = update_event(event_id, updates, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        LOG.warning("Failed to assign review owner: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to assign review owner") from exc
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"ok": True, "event": event}

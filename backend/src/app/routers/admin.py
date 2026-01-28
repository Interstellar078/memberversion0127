from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import get_db, require_admin
from ..auth import hash_password
from ..models import AuditLog, User
from ..schemas import AuditLogOut, UserOut, UserRoleUpdate, ResetPasswordRequest

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _user_out(user: User) -> UserOut:
    return UserOut(
        username=user.username,
        role=user.role,
        createdAt=int(user.created_at.timestamp() * 1000),
    )


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[UserOut]:
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return [_user_out(u) for u in users]


@router.delete("/users/{username}")
def delete_user(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict:
    if username == current_user.username:
        return {"success": False, "message": "不能删除当前管理员"}
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return {"success": True}
    if user.role == "admin":
        return {"success": False, "message": "不能删除管理员"}
    db.delete(user)
    db.commit()
    return {"success": True}


@router.get("/logs", response_model=list[AuditLogOut])
def list_logs(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[AuditLogOut]:
    logs = db.scalars(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(200)).all()
    return [
        AuditLogOut(
            id=log.id,
            timestamp=int(log.timestamp.timestamp() * 1000),
            username=log.username,
            action=log.action,
            details=log.details,
        )
        for log in logs
    ]


@router.put('/users/{username}/role')
def update_user_role(
    username: str,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict:
    if username == current_user.username:
        raise HTTPException(status_code=400, detail='不能修改当前管理员角色')
    if payload.role not in {'admin', 'user'}:
        raise HTTPException(status_code=400, detail='非法角色')
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail='用户不存在')
    user.role = payload.role
    db.commit()
    return {'success': True}


@router.post('/users/{username}/reset-password')
def reset_user_password(
    username: str,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=400, detail='密码长度至少6位')
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail='用户不存在')
    user.password_hash = hash_password(payload.password)
    db.commit()
    return {'success': True}

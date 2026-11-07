"""Authentication API — login, logout, password change."""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import verify_password
from app.models.user import User
from app.schemas.user import LoginRequest, LoginResponse, UserResponse, UserPasswordChange, UserProfileResponse
from app.services.auth_service import authenticate_user, create_token_for_user, change_user_password
from app.core.rate_limiting import limiter, RATE_LIMITS

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
@limiter.limit(RATE_LIMITS["auth"])
def login(request: Request, credentials: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token."""
    user = authenticate_user(db, credentials.username, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nom d'utilisateur ou mot de passe incorrect",
        )
    token = create_token_for_user(user)

    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=user.id,
        action="auth.login",
        entity_type="user",
        entity_id=user.id,
        details={"username": user.username, "role": user.role},
        ip_address=request.client.host if request.client else None,
    )

    return LoginResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/change-password")
@limiter.limit(RATE_LIMITS["auth"])
def change_password(
    request: Request,
    data: UserPasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password."""
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mot de passe actuel incorrect",
        )
    change_user_password(db, current_user, data.new_password)

    from app.utils.audit import log_action
    log_action(
        db=db,
        user_id=current_user.id,
        action="auth.change_password",
        entity_type="user",
        entity_id=current_user.id,
        details={"username": current_user.username},
        ip_address=request.client.host if request.client else None,
    )

    return {"message": "Mot de passe modifié avec succès"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current user profile."""
    return UserResponse.model_validate(current_user)


@router.get("/profiles", response_model=list[UserProfileResponse])
@limiter.limit(RATE_LIMITS["auth"])
def get_profiles(request: Request, db: Session = Depends(get_db)):
    """List active user profiles for the login screen.

    Public (utilisé par l'écran de login) mais strictement limité en débit
    pour empêcher l'énumération massive de comptes.
    """
    return db.query(User).filter(User.is_active == True).all()

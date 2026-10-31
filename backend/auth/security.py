import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import bcrypt
import jwt
from dotenv import load_dotenv

load_dotenv()

_raw_secret = os.getenv("JWT_SECRET", "")

# F-05: Fail closed if JWT_SECRET is absent or below 32-char entropy threshold
if not _raw_secret or len(_raw_secret) < 32:
    print(
        "[SECURITY] FATAL: JWT_SECRET is not set or is below the minimum 32-character "
        "entropy threshold. Set a strong JWT_SECRET in your .env file and restart. "
        "Refusing to start.",
        file=sys.stderr,
    )
    sys.exit(1)

SECRET_KEY = _raw_secret
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24)))  # 24 hours


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with random salt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against the stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None

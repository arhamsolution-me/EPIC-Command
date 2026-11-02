import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

try:
    from .models import Base
except ImportError:
    from models import Base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./epic_command.db")
if "@localhost:" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("@localhost:", "@127.0.0.1:")

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    try:
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20
        )
        with engine.connect() as conn:
            pass
    except Exception as e:
        print(f"[Database] PostgreSQL unavailable ({e}), automatically falling back to local SQLite database.")
        DATABASE_URL = "sqlite:///./epic_command.db"
        engine = create_engine(
            DATABASE_URL,
            connect_args={"check_same_thread": False}
        )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency for FastAPI routes to obtain a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)

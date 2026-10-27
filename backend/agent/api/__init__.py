from .nvr_api import router as nvr_router
from .agent_api import router as agent_router
from .ptz_api import router as ptz_router

__all__ = ["nvr_router", "agent_router", "ptz_router"]

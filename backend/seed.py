import os
import sys
from datetime import datetime, timezone
from sqlalchemy import text

# Ensure backend root is on path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import engine, SessionLocal, init_db
from models import Base, Role, Permission, RolePermission, User, Location, Agent, NVR, Camera
from auth.security import hash_password

PERMISSIONS_DATA = [
    # 1. Dashboard
    {"key": "DASHBOARD_VIEW", "name": "View Dashboard", "parent_key": None, "module": "Dashboard", "sort_order": 1},

    # 2. Live Monitor
    {"key": "LIVE_MONITOR_VIEW", "name": "View Live Monitor", "parent_key": None, "module": "Live Monitor", "sort_order": 2},
    {"key": "CAM_PTZ_CONTROL", "name": "PTZ Control", "parent_key": "LIVE_MONITOR_VIEW", "module": "Live Monitor", "sort_order": 3},
    {"key": "CAM_SNAPSHOT", "name": "Camera Snapshot", "parent_key": "LIVE_MONITOR_VIEW", "module": "Live Monitor", "sort_order": 4},
    {"key": "CAM_RECORD", "name": "Camera Record", "parent_key": "LIVE_MONITOR_VIEW", "module": "Live Monitor", "sort_order": 5},

    # 3. NVR Management
    {"key": "NVR_VIEW", "name": "View NVR", "parent_key": None, "module": "NVR Management", "sort_order": 6},
    {"key": "NVR_CREATE", "name": "Create NVR", "parent_key": "NVR_VIEW", "module": "NVR Management", "sort_order": 7},
    {"key": "NVR_UPDATE", "name": "Update NVR", "parent_key": "NVR_VIEW", "module": "NVR Management", "sort_order": 8},
    {"key": "NVR_DELETE", "name": "Delete NVR", "parent_key": "NVR_VIEW", "module": "NVR Management", "sort_order": 9},

    # 4. Agent Management
    {"key": "AGENT_VIEW", "name": "View Agents", "parent_key": None, "module": "Agent Management", "sort_order": 10},
    {"key": "AGENT_CREATE", "name": "Create Agent", "parent_key": "AGENT_VIEW", "module": "Agent Management", "sort_order": 11},
    {"key": "AGENT_UPDATE", "name": "Update Agent", "parent_key": "AGENT_VIEW", "module": "Agent Management", "sort_order": 12},
    {"key": "AGENT_DELETE", "name": "Delete Agent", "parent_key": "AGENT_VIEW", "module": "Agent Management", "sort_order": 13},

    # 5. User Management
    {"key": "USER_VIEW", "name": "View Users", "parent_key": None, "module": "User Management", "sort_order": 14},
    {"key": "USER_CREATE", "name": "Create User", "parent_key": "USER_VIEW", "module": "User Management", "sort_order": 15},
    {"key": "USER_UPDATE", "name": "Update User", "parent_key": "USER_VIEW", "module": "User Management", "sort_order": 16},
    {"key": "USER_DELETE", "name": "Delete User", "parent_key": "USER_VIEW", "module": "User Management", "sort_order": 17},

    # 6. Location Management
    {"key": "LOCATION_VIEW", "name": "View Locations", "parent_key": None, "module": "Location Management", "sort_order": 18},
    {"key": "LOCATION_CREATE", "name": "Create Location", "parent_key": "LOCATION_VIEW", "module": "Location Management", "sort_order": 19},
    {"key": "LOCATION_DELETE", "name": "Delete Location", "parent_key": "LOCATION_VIEW", "module": "Location Management", "sort_order": 20}
]


def run_migrations():
    """Add new columns to existing tables safely if not already present."""
    with engine.connect() as conn:
        # Columns for agents
        conn.execute(text("ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;"))
        conn.execute(text("ALTER TABLE agents ADD COLUMN IF NOT EXISTS location_id INTEGER;"))
        # Columns for nvrs
        conn.execute(text("ALTER TABLE nvrs ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;"))
        conn.execute(text("ALTER TABLE nvrs ADD COLUMN IF NOT EXISTS province VARCHAR(80);"))
        conn.execute(text("ALTER TABLE nvrs ADD COLUMN IF NOT EXISTS city VARCHAR(80);"))
        conn.execute(text("ALTER TABLE nvrs ADD COLUMN IF NOT EXISTS area VARCHAR(80);"))
        conn.execute(text("ALTER TABLE nvrs ADD COLUMN IF NOT EXISTS site VARCHAR(80);"))
        conn.commit()
    print("Database column migrations applied successfully.")


def seed_database():
    """Seed initial permissions, roles, Super Admin, and locations."""
    init_db()
    run_migrations()

    db = SessionLocal()
    try:
        # 1. Seed Permissions
        perm_map = {}
        for p in PERMISSIONS_DATA:
            existing = db.query(Permission).filter(Permission.key == p["key"]).first()
            if not existing:
                existing = Permission(
                    key=p["key"],
                    name=p["name"],
                    parent_key=p["parent_key"],
                    module=p["module"],
                    sort_order=p["sort_order"]
                )
                db.add(existing)
                db.flush()
            perm_map[p["key"]] = existing
        db.commit()
        print(f"Seeded {len(perm_map)} permissions.")

        # 2. Seed Default Roles
        # Super Admin Role
        super_admin_role = db.query(Role).filter(Role.name == "Super Admin").first()
        if not super_admin_role:
            super_admin_role = Role(
                name="Super Admin",
                description="Global Super Administrator with full, unconstrained system privileges.",
                is_system=True,
                is_active=True
            )
            db.add(super_admin_role)
            db.flush()

            # Assign all permissions to Super Admin
            for perm in perm_map.values():
                db.add(RolePermission(role_id=super_admin_role.id, permission_id=perm.id))
            db.commit()
            print("Seeded 'Super Admin' role with all permissions.")

        # Operator / Branch Manager Role
        operator_role = db.query(Role).filter(Role.name == "Branch Operator").first()
        if not operator_role:
            operator_role = Role(
                name="Branch Operator",
                description="Can view dashboard, live monitor, control PTZ, and register NVRs to assigned agent.",
                is_system=False,
                is_active=True
            )
            db.add(operator_role)
            db.flush()

            operator_keys = [
                "DASHBOARD_VIEW",
                "LIVE_MONITOR_VIEW", "CAM_PTZ_CONTROL", "CAM_SNAPSHOT", "CAM_RECORD",
                "NVR_MANAGE", "NVR_VIEW", "NVR_CREATE", "NVR_UPDATE"
            ]
            for k in operator_keys:
                if k in perm_map:
                    db.add(RolePermission(role_id=operator_role.id, permission_id=perm_map[k].id))
            db.commit()
            print("Seeded 'Branch Operator' role.")

        # Viewer / Security Guard Role
        viewer_role = db.query(Role).filter(Role.name == "Security Guard (Viewer)").first()
        if not viewer_role:
            viewer_role = Role(
                name="Security Guard (Viewer)",
                description="Read-only live surveillance monitor view.",
                is_system=False,
                is_active=True
            )
            db.add(viewer_role)
            db.flush()

            viewer_keys = ["DASHBOARD_VIEW", "LIVE_MONITOR_VIEW", "NVR_MANAGE", "NVR_VIEW"]
            for k in viewer_keys:
                if k in perm_map:
                    db.add(RolePermission(role_id=viewer_role.id, permission_id=perm_map[k].id))
            db.commit()
            print("Seeded 'Security Guard (Viewer)' role.")

        # 3. Seed Default Super Admin User
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            admin_user = User(
                username="admin",
                email="admin@epicvision.com",
                full_name="System Super Administrator",
                password_hash=hash_password("Admin@12345"),
                role_id=super_admin_role.id,
                location_scope="global",
                is_active=True,
                is_superadmin=True,
                permission_version=1
            )
            db.add(admin_user)
            db.commit()
            print("Seeded default Super Admin account: 'admin' / 'Admin@12345'")

        # 4. Seed Initial Location Hierarchy (Provinces -> Cities -> Sites)
        if db.query(Location).count() == 0:
            # Province: Punjab
            punjab = Location(name="Punjab", type="province", parent_id=None)
            db.add(punjab)
            db.flush()

            lahore = Location(name="Lahore", type="city", parent_id=punjab.id)
            db.add(lahore)
            db.flush()

            gulberg = Location(name="Gulberg III", type="area", parent_id=lahore.id)
            db.add(gulberg)
            db.flush()

            lhr_site = Location(name="Lahore HQ Command Center", type="site", parent_id=gulberg.id)
            db.add(lhr_site)

            # Province: Islamabad Capital Territory
            ict = Location(name="Islamabad Capital Territory", type="province", parent_id=None)
            db.add(ict)
            db.flush()

            isb = Location(name="Islamabad", type="city", parent_id=ict.id)
            db.add(isb)
            db.flush()

            f8 = Location(name="Sector F-8", type="area", parent_id=isb.id)
            db.add(f8)
            db.flush()

            isb_site = Location(name="Islamabad Regional Branch", type="site", parent_id=f8.id)
            db.add(isb_site)

            # Province: Sindh
            sindh = Location(name="Sindh", type="province", parent_id=None)
            db.add(sindh)
            db.flush()

            khi = Location(name="Karachi", type="city", parent_id=sindh.id)
            db.add(khi)
            db.flush()

            khi_site = Location(name="Karachi Port Facility", type="site", parent_id=khi.id)
            db.add(khi_site)

            db.commit()
            print("Seeded sample location hierarchy (Punjab, ICT, Sindh).")

        # 5. Link any existing NVRs to default site if empty
        existing_nvrs = db.query(NVR).filter(NVR.province == None).all()
        for nvr in existing_nvrs:
            nvr.province = "Punjab"
            nvr.city = "Lahore"
            nvr.area = "Gulberg III"
            nvr.site = "Lahore HQ Command Center"
            nvr.created_by_user_id = admin_user.id
        db.commit()

        print("Database seeding & migration completed successfully!")

    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()

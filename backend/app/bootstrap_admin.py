from getpass import getpass
import sys

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select

from app.core.config import settings
from app.db import get_session_factory
from app.models import User
from app.security import hash_password


def main() -> int:
    if not settings.database_url or len(settings.jwt_secret) < 32:
        print("Configure DATABASE_URL and JWT_SECRET before bootstrapping.")
        return 1
    with get_session_factory()() as db:
        if db.scalar(select(User.id).where(User.role == "admin")) is not None:
            print("An administrator already exists; bootstrap refused.")
            return 1
    raw_email = settings.admin_email or input("Initial administrator email: ").strip()
    try:
        email = str(TypeAdapter(EmailStr).validate_python(raw_email)).lower()
    except ValidationError:
        print("Enter a valid email address.")
        return 1
    password = settings.admin_password
    if not password:
        password = getpass("Initial administrator password (12+ characters): ")
        confirmation = getpass("Confirm password: ")
        if password != confirmation:
            print("Passwords do not match.")
            return 1
    if len(password) < 12:
        print("Administrator password must be at least 12 characters.")
        return 1
    with get_session_factory()() as db:
        user = User(
            email=email,
            name="BugHound Administrator",
            password_hash=hash_password(password),
            role="admin",
        )
        db.add(user)
        db.commit()
    print(f"Created initial administrator {email}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

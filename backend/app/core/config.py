
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    database_url: str = ""
    jwt_secret: str = ""
    jwt_expire_minutes: int = 60

    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173"
    )

    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-4o-mini"

    github_token: str = ""
    authorized_repositories: str = ""

    github_actions_token: str = ""
    bughound_actions_repository: str = "behra527/bughound"
    bughound_actions_workflow: str = "bughound-ci.yml"
    bughound_actions_ref: str = "main"

    github_actions_poll_interval_seconds: int = 5
    github_actions_run_timeout_seconds: int = 1800
    github_actions_max_dispatch_bytes: int = 55000

    # Legacy runner configuration; retained temporarily.
    public_api_url: str = "http://localhost:8000"
    ci_runner_url: str = ""
    ci_runner_token: str = ""
    runner_callback_secret: str = ""

    admin_email: str = ""
    admin_password: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def authorized_repository_set(self) -> set[str]:
        return {
            item.strip().lower().removesuffix(".git").strip("/")
            for item in self.authorized_repositories.split(",")
            if item.strip()
        }

    @property
    def github_actions_configured(self) -> bool:
        return bool(
            self.github_actions_token
            and self.bughound_actions_repository
            and self.bughound_actions_workflow
            and self.bughound_actions_ref
        )

    @property
    def ready_configuration(self) -> bool:
        return bool(
            self.database_url
            and len(self.jwt_secret) >= 32
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

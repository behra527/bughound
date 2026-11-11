from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    company: str = Field(default="", max_length=200)


class PasswordUpdate(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


class UserView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    role: str
    company: str = ""


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserView


class TicketCreate(BaseModel):
    title: str = Field(min_length=4, max_length=240)
    description: str = Field(min_length=10, max_length=4000)
    steps_to_reproduce: str = Field(min_length=3, max_length=8000)


class RepositoryConnect(BaseModel):
    repository_url: str = Field(min_length=20, max_length=500)


class CustomerCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=12, max_length=256)
    company: str = Field(default="", max_length=200)


class AgentRunView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    agent_name: str
    status: str
    output_data: dict | None
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None


class TicketView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    customer_name: str
    repository_url: str | None
    repository: str
    title: str
    description: str
    steps_to_reproduce: str
    status: str
    stage: str
    base_branch: str
    base_commit_sha: str
    investigation_report: dict | None
    validation_report: dict | None
    patch_diff: str | None
    patch_files: list[dict] | None
    test_status: str
    test_report: dict | None
    approval_by: int | None
    pr_url: str | None
    pr_number: int | None
    fix_branch: str | None
    resulting_commit_sha: str | None
    verification_status: str
    error_message: str | None
    created_at: datetime
    updated_at: datetime

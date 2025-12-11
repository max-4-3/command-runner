from sqlmodel import JSON, Column, Field, SQLModel

class BaseTask(SQLModel):
    id: str = Field(index=True, primary_key=True)
    command: str
    args: list[str] = Field(default_factory=list, sa_column=Column(JSON))

class TaskClient(BaseTask, table=True):
    status: str
    fullLog: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    saved: bool = Field(default=True)

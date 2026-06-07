from typing import Literal

from pydantic import BaseModel, Field


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class PracticeRequest(BaseModel):
    scenarioId: str
    transcript: str
    mode: Literal["feedback", "immersive"] = "feedback"
    history: list[ConversationMessage] = Field(default_factory=list)


class SummaryRequest(BaseModel):
    scenarioId: str
    mode: Literal["feedback", "immersive"] = "immersive"
    history: list[ConversationMessage] = Field(default_factory=list)



class ImitateRequest(BaseModel):
    scenarioId: str
    referenceText: str
    transcript: str

class TranslationRequest(BaseModel):
    text: str
    direction: str = "auto"

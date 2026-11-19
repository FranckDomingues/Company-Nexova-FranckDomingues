from datetime import datetime, timezone
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Country(str, Enum):
    SPAIN = "Spain"
    USA = "USA"


class SupplierStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class SupplierCategory(str, Enum):
    JOB_BOARDS = "job_boards"
    ATS_SOFTWARE = "ats_software"
    ASSESSMENT_TOOLS = "assessment_tools"
    TRAINING_PLATFORMS = "training_platforms"
    PAYROLL_AND_HR_SOFTWARE = "payroll_and_hr_software"
    VIDEO_INTERVIEW = "video_interview"
    BACKGROUND_CHECK = "background_check"
    OFFICE_AND_FACILITIES = "office_and_facilities"
    IT_AND_SOFTWARE_LICENSES = "it_and_software_licenses"


class Currency(str, Enum):
    EUR = "EUR"
    USD = "USD"


PositiveRate = Annotated[float, Field(gt=0, allow_inf_nan=False)]


class SupplierInput(BaseModel):
    """Client-provided supplier fields; timestamps and IDs are server-owned."""

    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, Field(min_length=1)]
    country: Country
    categories: Annotated[list[SupplierCategory], Field(min_length=1)]
    monthly_rate: PositiveRate
    currency: Currency
    status: SupplierStatus
    contract_renewal_date: str | None = None
    contact_email: str | None = None
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("name must not be blank")
        return value.strip()

    @field_validator("contract_renewal_date")
    @classmethod
    def renewal_date_must_be_iso_date(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                datetime.strptime(value, "%Y-%m-%d")
            except ValueError as exc:
                raise ValueError("contract_renewal_date must use YYYY-MM-DD") from exc
            if len(value) != 10:
                raise ValueError("contract_renewal_date must use YYYY-MM-DD")
        return value

    @model_validator(mode="after")
    def currency_must_match_country(self) -> "SupplierInput":
        expected = Currency.EUR if self.country is Country.SPAIN else Currency.USD
        if self.currency is not expected:
            raise ValueError(f"currency for {self.country.value} must be {expected.value}")
        return self


class Supplier(SupplierInput):
    id: int
    updated_at: datetime


class SupplierCreate(SupplierInput):
    pass


class SupplierRateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    monthly_rate: PositiveRate


class SupplierStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: SupplierStatus


def system_timestamp() -> datetime:
    return datetime.now(timezone.utc)

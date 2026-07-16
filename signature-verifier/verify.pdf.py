from __future__ import annotations

import contextlib
import hashlib
import importlib.metadata
import io
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str))


def scalar(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        value = " ".join(str(item) for item in value if item is not None)
    text = str(value).strip()
    return text or None


def iso(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


def enum_name(value: Any) -> str | None:
    if value is None:
        return None
    name = getattr(value, "name", None)
    return str(name or value).replace("SignatureCoverageLevel.", "").replace(
        "ModificationLevel.", ""
    )


def extract_national_ids(subject: dict[str, Any]) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    seen: set[str] = set()

    for source in ("serial_number", "organization_identifier"):
        raw = scalar(subject.get(source))
        if not raw:
            continue
        upper = raw.upper()
        digits = re.sub(r"\D", "", upper)
        values: list[str] = []

        prefixed = re.search(r"(?:IDCE[A-Z]*|TINEC)\D*(\d{10})(?:\d{3})?", upper)
        if prefixed:
            values.append(prefixed.group(1))
        if len(digits) == 10:
            values.append(digits)
        elif source == "organization_identifier" and len(digits) == 13:
            values.append(digits[:10])

        for value in values:
            if value not in seen:
                seen.add(value)
                candidates.append({"value": value, "source": source})

    return candidates


def load_trust_roots(load_cert_from_pemder: Any) -> list[Any]:
    configured = os.getenv("SIGNATURE_TRUST_ROOTS", "").strip()
    if not configured:
        return []

    roots: list[Any] = []
    for item in configured.split(os.pathsep):
        path = Path(item.strip())
        if not path.is_file():
            continue
        try:
            roots.append(load_cert_from_pemder(str(path)))
        except Exception:
            continue
    return roots


def pdf_string(signature: Any, key: str) -> str | None:
    try:
        return scalar(signature.sig_object.get(key))
    except Exception:
        return None


def main() -> None:
    if len(sys.argv) != 2:
        emit(
            {
                "schema_version": SCHEMA_VERSION,
                "status": "ERROR",
                "error_code": "INVALID_ARGUMENTS",
                "signature_count": 0,
                "signatures": [],
            }
        )
        return

    file_path = Path(sys.argv[1])
    if not file_path.is_file():
        emit(
            {
                "schema_version": SCHEMA_VERSION,
                "status": "ERROR",
                "error_code": "FILE_NOT_FOUND",
                "signature_count": 0,
                "signatures": [],
            }
        )
        return

    try:
        from pyhanko.keys import load_cert_from_pemder
        from pyhanko.pdf_utils.reader import PdfFileReader
        from pyhanko.sign.validation import validate_pdf_signature
        from pyhanko_certvalidator import ValidationContext
    except Exception:
        emit(
            {
                "schema_version": SCHEMA_VERSION,
                "status": "ERROR",
                "error_code": "ENGINE_UNAVAILABLE",
                "signature_count": 0,
                "signatures": [],
            }
        )
        return

    roots = load_trust_roots(load_cert_from_pemder)
    allow_fetching = os.getenv("SIGNATURE_ALLOW_NETWORK", "false").lower() == "true"
    engine_version = importlib.metadata.version("pyHanko")
    signatures: list[dict[str, Any]] = []
    logging.disable(logging.CRITICAL)

    try:
        with file_path.open("rb") as source:
            reader = PdfFileReader(source)
            embedded_signatures = reader.embedded_signatures

            for index, embedded in enumerate(embedded_signatures, start=1):
                certificate = embedded.signer_cert
                subject = certificate.subject.native
                issuer = certificate.issuer.native
                validation_error = None
                status = None

                try:
                    context = ValidationContext(
                        trust_roots=roots or None,
                        allow_fetching=allow_fetching,
                        revocation_mode="soft-fail",
                    )
                    with contextlib.redirect_stderr(io.StringIO()):
                        status = validate_pdf_signature(
                            embedded,
                            signer_validation_context=context,
                        )
                except Exception as exc:
                    validation_error = type(exc).__name__

                valid_from = certificate.not_valid_before
                valid_to = certificate.not_valid_after
                now = datetime.now(timezone.utc)
                expired = bool(valid_to and now > valid_to)
                not_yet_valid = bool(valid_from and now < valid_from)
                intact = bool(getattr(status, "intact", False))
                cryptographic_valid = bool(getattr(status, "valid", False))
                docmdp_ok = getattr(status, "docmdp_ok", None)
                integrity_valid = intact and cryptographic_valid and docmdp_ok is not False
                timestamp_status = getattr(status, "timestamp_validity", None)
                signing_time = getattr(status, "signer_reported_dt", None)
                if signing_time is None:
                    signing_time = embedded.self_reported_timestamp

                signatures.append(
                    {
                        "index": index,
                        "field_name": embedded.field_name,
                        "common_name": scalar(subject.get("common_name")),
                        "given_name": scalar(subject.get("given_name")),
                        "surname": scalar(subject.get("surname")),
                        "organization": scalar(subject.get("organization_name")),
                        "country": scalar(subject.get("country_name")),
                        "national_id_candidates": extract_national_ids(subject),
                        "issuer_common_name": scalar(issuer.get("common_name")),
                        "certificate_fingerprint_sha256": hashlib.sha256(
                            certificate.dump()
                        ).hexdigest(),
                        "certificate_valid_from": iso(valid_from),
                        "certificate_valid_to": iso(valid_to),
                        "expired": expired,
                        "not_yet_valid": not_yet_valid,
                        "signing_time": iso(signing_time),
                        "digest_algorithm": scalar(
                            getattr(status, "md_algorithm", None)
                            or embedded.md_algorithm
                        ),
                        "subfilter": pdf_string(embedded, "/SubFilter"),
                        "reason": pdf_string(embedded, "/Reason"),
                        "location": pdf_string(embedded, "/Location"),
                        "integrity_valid": integrity_valid,
                        "intact": intact,
                        "cryptographic_signature_valid": cryptographic_valid,
                        "trusted": bool(getattr(status, "trusted", False)),
                        "revoked": bool(getattr(status, "revoked", False)),
                        "coverage": enum_name(getattr(status, "coverage", None)),
                        "modification_level": enum_name(
                            getattr(status, "modification_level", None)
                        ),
                        "docmdp_ok": docmdp_ok,
                        "timestamp_valid": (
                            bool(getattr(timestamp_status, "bottom_line", False))
                            if timestamp_status is not None
                            else None
                        ),
                        "validation_error": validation_error,
                    }
                )
    except Exception as exc:
        emit(
            {
                "schema_version": SCHEMA_VERSION,
                "engine": {"name": "pyhanko", "version": engine_version},
                "status": "ERROR",
                "error_code": type(exc).__name__,
                "trust_configured": bool(roots),
                "network_validation_enabled": allow_fetching,
                "signature_count": 0,
                "signatures": [],
            }
        )
        return

    if not signatures:
        document_status = "UNSIGNED"
    elif all(signature["integrity_valid"] for signature in signatures):
        document_status = "SIGNED_INTACT"
    else:
        document_status = "SIGNED_INVALID"

    emit(
        {
            "schema_version": SCHEMA_VERSION,
            "engine": {"name": "pyhanko", "version": engine_version},
            "status": document_status,
            "trust_configured": bool(roots),
            "network_validation_enabled": allow_fetching,
            "signature_count": len(signatures),
            "signatures": signatures,
        }
    )


if __name__ == "__main__":
    main()

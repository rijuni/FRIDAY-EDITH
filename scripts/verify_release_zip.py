import os
import re
import stat
import sys
import ntpath
import zipfile


MAX_ARCHIVE_FILES = 10_000
MAX_ARCHIVE_UNCOMPRESSED_BYTES = 200 * 1024 * 1024
MAX_ENTRY_BYTES = 20 * 1024 * 1024

SENSITIVE_PATTERNS = [
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----", re.I), "Private key block detected"),
    (re.compile(r"\$argon2(?:id|i|d)?\$v=\d+", re.I), "Argon2 password hash detected"),
    (re.compile(r"DATABASE_URL\s*=\s*['\"]?mysql://([^:/?#]+):([^@/?#]+)@", re.I), "Database URL with credentials detected"),
]

DUMP_PATTERNS = [
    re.compile(r"INSERT\s+INTO\s+[`\"]?(?:User|Session|AuditLog|ProviderKey)[`\"]?\s+", re.I),
    re.compile(r"^-- (?:MySQL dump|PostgreSQL database dump)|^SQLite format 3|-- Dump completed on \d{4}-\d{2}-\d{2}", re.M),
]

FORBIDDEN_DIR_NAMES = {
    ".git", "node_modules", ".venv", "venv", "ENV", "__pycache__",
    ".pytest_cache", "dist", "build", ".tmp", "tmp", "backups",
    ".system_generated",
}

REQUIRED_CANONICAL_FILES = [
    "services/api/prisma/schema.prisma",
    "services/api/prisma/migrations/20261113000000_init/migration.sql",
    "services/api/prisma/migrations/migration_lock.toml",
    "package.json",
    "package-lock.json",
    ".env.example",
    "README.md",
    "PHASE_1_COMPLETION_REPORT.md",
]

BINARY_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".woff", ".woff2", ".ttf", ".eot"}


def _is_placeholder_password(password):
    normalized = password.strip().lower()
    return normalized in {
        "replace_with_dev_password", "replace_with_staging_password",
        "replace_with_production_password", "password", "<password>", "changeme",
    }


def _entry_violations(name, info):
    violations = []
    if ":" in name or "\\" in name or name.startswith("/") or ntpath.splitdrive(name)[0]:
        violations.append(f"Non-portable or absolute archive path: {name}")
    parts = name.rstrip("/").split("/")
    if any(part in {"", ".", ".."} for part in parts):
        violations.append(f"Unsafe archive path component: {name}")
    directory_parts = parts if info.is_dir() else parts[:-1]
    if any(part.lower() in FORBIDDEN_DIR_NAMES for part in directory_parts):
        violations.append(f"Forbidden directory component: {name}")

    basename = parts[-1] if parts else ""
    lower = basename.lower()
    if basename.lower().startswith(".env") and basename.lower() != ".env.example":
        violations.append(f"Environment secret file: {name}")
    if lower.endswith((".backup", ".bak", ".db", ".db-journal", ".db-wal", ".sqlite", ".sqlite3")):
        violations.append(f"Database or backup file: {name}")
    if lower.endswith((".zip", ".tar.gz", ".tgz", ".rar", ".7z")):
        violations.append(f"Nested archive: {name}")
    if lower.endswith(".sql") and "services/api/prisma/migrations/" not in name.lower():
        violations.append(f"SQL dump outside Prisma migrations: {name}")
    if "archive" in lower and lower.endswith(".json"):
        violations.append(f"Historical archive file: {name}")

    mode = info.external_attr >> 16
    if stat.S_ISLNK(mode):
        violations.append(f"Symbolic link entry: {name}")
    return violations


def _scan_entry(name, content):
    text = content.decode("utf-8", errors="ignore")
    violations = []
    for pattern, label in SENSITIVE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        if label == "Database URL with credentials detected" and _is_placeholder_password(match.group(2)):
            continue
        violations.append(f"{label}: {name}")

    is_prisma_migration = name.startswith("services/api/prisma/migrations/")
    if not is_prisma_migration:
        for pattern in DUMP_PATTERNS:
            if pattern.search(text):
                violations.append(f"Database dump signature detected: {name}")
                break
    return violations


def verify_release_zip(zip_path):
    zip_path = os.path.abspath(zip_path)
    print("=" * 80)
    print("  F.R.I.D.A.Y. + E.D.I.T.H. Release ZIP Verification")
    print("=" * 80)
    print(f"Target Archive: {zip_path}")

    if not os.path.isfile(zip_path):
        raise FileNotFoundError(f"Archive does not exist: {zip_path}")

    archive_violations = []
    with zipfile.ZipFile(zip_path, "r") as archive:
        entries = archive.infolist()
        if len(entries) > MAX_ARCHIVE_FILES:
            raise ValueError(f"Archive contains too many entries ({len(entries)} > {MAX_ARCHIVE_FILES}).")

        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)):
            archive_violations.append("Archive contains duplicate entry paths")

        names_set = set(names)
        missing = sorted(set(REQUIRED_CANONICAL_FILES) - names_set)
        if missing:
            archive_violations.extend(f"Missing required file: {name}" for name in missing)

        declared_uncompressed = 0
        actual_uncompressed = 0
        for entry in entries:
            name = entry.filename
            archive_violations.extend(_entry_violations(name, entry))
            if entry.is_dir():
                continue
            if entry.file_size > MAX_ENTRY_BYTES:
                archive_violations.append(f"Entry exceeds {MAX_ENTRY_BYTES} byte scan limit: {name}")
                continue
            declared_uncompressed += entry.file_size
            if declared_uncompressed > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
                raise ValueError("Archive exceeds the uncompressed-size scan limit.")

            actual = bytearray()
            with archive.open(entry, "r") as stream:
                while True:
                    chunk = stream.read(64 * 1024)
                    if not chunk:
                        break
                    if len(actual) + len(chunk) > MAX_ENTRY_BYTES:
                        archive_violations.append(f"Entry expands beyond the scan limit: {name}")
                        actual.clear()
                        break
                    actual.extend(chunk)
                    actual_uncompressed += len(chunk)
                    if actual_uncompressed > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
                        raise ValueError("Archive exceeds the uncompressed-size scan limit.")

            if actual and os.path.splitext(name.lower())[1] not in BINARY_EXTENSIONS:
                archive_violations.extend(_scan_entry(name, bytes(actual)))

    if archive_violations:
        print(f"❌ Verification failed with {len(archive_violations)} finding(s):")
        for violation in archive_violations:
            print(f"  - {violation}")
        return False

    print(f"✅ Verified {len(entries)} entries without extracting the archive.")
    print("✅ No disallowed paths or known sensitive-content patterns detected.")
    return True


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "Friday-Edith-release.zip",
    )
    try:
        success = verify_release_zip(target)
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError) as error:
        print(f"❌ Verification could not complete: {error}")
        sys.exit(1)
    sys.exit(0 if success else 1)

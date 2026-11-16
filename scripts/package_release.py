import os
import sys
import re
import zipfile
import tempfile

# Sensitive content detection patterns for pre-audit
CONTENT_PATTERNS = [
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----", re.I), "Private key block detected"),
    (re.compile(r"\$argon2(?:id|i|d)?\$", re.I), "Argon2 password hash detected"),
    (re.compile(r"INSERT\s+INTO\s+[`\"]?(?:User|Session|AuditLog|ProviderKey)[`\"]?\s+", re.I), "Database user/credential export dump detected"),
    (re.compile(r"^-- (?:MySQL dump|PostgreSQL database dump)|^SQLite format 3|-- Dump completed on \d{4}-\d{2}-\d{2}", re.M), "Database dump signature detected"),
]

# Sensitive config checks (prevent committing live secrets even in text files)
LIVE_CRED_PATTERNS = [
    re.compile(r"DATABASE_URL\s*=\s*['\"]?mysql://[^:/?#]+:([^@/?#]+)@", re.I),
]

FORBIDDEN_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "ENV",
    "__pycache__",
    ".pytest_cache",
    "dist",
    "build",
    ".tmp",
    "tmp",
    "backups",
    ".system_generated"
}

def is_forbidden_file(filename, rel_path):
    # Safe exception: .env.example
    if filename == ".env.example":
        return False

    # Block any .env or .env.* variant
    if filename.startswith(".env"):
        return True

    # Block backup, temporary, and database files
    if filename.endswith((".backup", ".bak", ".db", ".db-journal", ".db-wal", ".db-shm", ".sqlite", ".sqlite3", ".log")):
        return True

    # Block archive files
    if filename.endswith((".zip", ".tar.gz", ".tgz", ".rar", ".7z")):
        return True

    # Block historical database archives
    if "archive" in filename.lower() and filename.endswith(".json"):
        return True

    # Block SQL dumps (except schema migration files in prisma/migrations)
    if filename.endswith(".sql"):
        normalized = rel_path.replace("\\", "/")
        if "services/api/prisma/migrations/" not in normalized:
            return True

    return False

def scan_file_content(full_path, rel_path):
    """Scans candidate files for leaked credentials, private keys, or data dumps."""
    if os.path.islink(full_path):
        return [f"Symbolic links are not permitted in release archives: {rel_path}"]

    # Skip binary files by extension
    binary_extensions = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".woff", ".woff2", ".ttf", ".eot"}
    _, ext = os.path.splitext(full_path.lower())
    if ext in binary_extensions:
        return []

    violations = []
    try:
        with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        for pattern, label in CONTENT_PATTERNS:
            if pattern.search(content):
                violations.append(f"{label} in {rel_path}")

        for pattern in LIVE_CRED_PATTERNS:
            match = pattern.search(content)
            if match and match.group(1).lower() not in {
                "replace_with_dev_password", "replace_with_staging_password",
                "replace_with_production_password", "password", "<password>", "changeme"
            }:
                violations.append(f"Unsanitized live database connection string in {rel_path}")

    except Exception as e:
        violations.append(f"Unable to read {rel_path} for security scanning: {e}")

    return violations

def package_release(output_file=None):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)

    if not output_file:
        output_file = os.path.join(repo_root, "Friday-Edith-release.zip")

    output_file = os.path.abspath(output_file)
    output_dir = os.path.dirname(output_file)
    if not os.path.isdir(output_dir):
        print(f"❌ Output directory does not exist: {output_dir}")
        sys.exit(1)
    staging_file = None

    print("================================================================================")
    print("  F.R.I.D.A.Y. + E.D.I.T.H. Fail-Closed Release Packaging & Audit Engine")
    print("================================================================================")
    print(f"Source Repository : {repo_root}")
    print(f"Target Archive    : {output_file}")

    # Step 1: Scan repository and filter files
    print("\n[Step 1/4] Scanning repository structure and pruning forbidden trees...")
    candidate_files = []
    excluded_files = 0

    for root, dirs, files in os.walk(repo_root):
        # Prune blacklisted directories immediately so walk never traverses them
        dirs[:] = [
            d for d in dirs
            if d not in FORBIDDEN_DIRS and not os.path.islink(os.path.join(root, d))
        ]

        for f in files:
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, repo_root)

            # Never package existing zip outputs or staging files
            if full_path == output_file or f.endswith((".zip", ".staging", ".staging.tmp")):
                continue

            if is_forbidden_file(f, rel_path):
                excluded_files += 1
                continue

            candidate_files.append((full_path, rel_path))

    print(f"  -> Pruned directories (.git, node_modules, .venv, dist, build, backups).")
    print(f"  -> Excluded {excluded_files} blacklisted files (.env*, backups, SQL dumps).")
    print(f"  -> Identified {len(candidate_files)} candidate source files.")

    # Step 2: Content Security Scan (Fail-Closed)
    print("\n[Step 2/4] Executing deep content security scan on candidate files...")
    content_violations = []

    for full_path, rel_path in candidate_files:
        violations = scan_file_content(full_path, rel_path)
        content_violations.extend(violations)

    if content_violations:
        print(f"\n❌ SECURITY AUDIT FAILED: Detected {len(content_violations)} critical content violations:")
        for v in content_violations:
            print(f"   [VIOLATION] {v}")
        print("\nABORTING PACKAGING: Archive will NOT be generated (fail-closed).\n")
        sys.exit(1)

    print(f"  ✅ Known-pattern content scan passed across {len(candidate_files)} candidate files.")
    print("  Note: pattern scanning reduces risk but cannot prove an archive contains no secrets.")

    # Step 3: Create a unique staging archive beside the destination.
    print("\n[Step 3/4] Compressing verified candidate files to staging archive...")
    try:
        descriptor, staging_file = tempfile.mkstemp(
            prefix=os.path.basename(output_file) + ".staging-",
            suffix=".staging.tmp",
            dir=output_dir,
        )
        os.close(descriptor)
        with zipfile.ZipFile(staging_file, "w", zipfile.ZIP_DEFLATED) as zf:
            for full_path, rel_path in candidate_files:
                arcname = rel_path.replace("\\", "/")
                zf.write(full_path, arcname)

        staging_size_bytes = os.path.getsize(staging_file)
        staging_size_mb = round(staging_size_bytes / (1024 * 1024), 2)
        print(f"  -> Staging archive generated: {staging_size_mb} MB ({staging_size_bytes} bytes).")
    except Exception as e:
        if staging_file and os.path.exists(staging_file):
            os.remove(staging_file)
        print(f"❌ Failed to compress archive: {e}")
        sys.exit(1)

    # Step 4: Final Archive Entry Verification & Promotion
    print("\n[Step 4/4] Verifying internal archive entries and promoting release...")
    archive_violations = []
    has_schema = False
    has_migration = False
    has_env_example = False

    try:
      with zipfile.ZipFile(staging_file, "r") as zf:
        for name in zf.namelist():
            basename = os.path.basename(name)
            parts = name.split("/")

            # Check for forbidden directory leakage
            for part in parts[:-1]:
                if part in FORBIDDEN_DIRS:
                    archive_violations.append(f"Forbidden directory entry: {name}")

            # Check for environment secrets
            if basename.lower().startswith(".env") and basename.lower() != ".env.example":
                archive_violations.append(f"Forbidden environment file: {name}")

            if basename.lower() == ".env.example":
                has_env_example = True

            # Check for database dumps
            if basename.lower().endswith(".sql") and "services/api/prisma/migrations/" not in name.lower():
                archive_violations.append(f"Forbidden SQL dump: {name}")

            if name.lower() == "services/api/prisma/schema.prisma":
                has_schema = True

            if "services/api/prisma/migrations/20261113000000_init/migration.sql" in name.lower():
                has_migration = True
    except Exception:
        if staging_file and os.path.exists(staging_file):
            os.remove(staging_file)
        raise

    if not has_schema:
        archive_violations.append("Missing canonical Prisma schema in archive")
    if not has_migration:
        archive_violations.append("Missing canonical Prisma migration in archive")
    if not has_env_example:
        archive_violations.append("Missing .env.example template in archive")

    if archive_violations:
        if staging_file and os.path.exists(staging_file):
            os.remove(staging_file)
        print(f"\n❌ POST-PACKAGING AUDIT FAILED: Detected {len(archive_violations)} entry violations:")
        for v in archive_violations:
            print(f"   [VIOLATION] {v}")
        sys.exit(1)

    # os.replace atomically replaces an existing archive on the same filesystem.
    try:
        os.replace(staging_file, output_file)
    except Exception:
        if staging_file and os.path.exists(staging_file):
            os.remove(staging_file)
        raise

    print("  ✅ Post-Packaging audit passed: required files and archive entry rules verified.")
    print("  ✅ Verified canonical schema: services/api/prisma/schema.prisma")
    print("  ✅ Verified canonical migration: services/api/prisma/migrations/20261113000000_init/migration.sql")
    print("  ✅ .env.example passed the configured placeholder-aware pattern scan.")
    print(f"  -> Successfully promoted clean release archive to: {output_file}")
    print("  -> No additional destinations were written.")

    print("\n================================================================================")
    print(f"  RELEASE PACKAGING COMPLETE: Clean security-safe ZIP ready at:")
    print(f"  {output_file} ({staging_size_mb} MB)")
    print("================================================================================\n")

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else None
    package_release(out)

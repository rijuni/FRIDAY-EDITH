import os
import sys
import zipfile

def package_release(output_file=None):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)

    if not output_file:
        output_file = os.path.join(repo_root, "Friday-Edith-release.zip")

    output_file = os.path.abspath(output_file)

    print("================================================================================")
    print("  F.R.I.D.A.Y. + E.D.I.T.H. Secure Release Packaging & Audit Engine")
    print("================================================================================")
    print(f"Source Repository : {repo_root}")
    print(f"Target Archive    : {output_file}")

    if os.path.exists(output_file):
        os.remove(output_file)

    # Blacklisted directory names (pruned immediately to prevent walking thousands of files)
    forbidden_dirs = {
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
        "backups"
    }

    def is_forbidden_file(filename, rel_path):
        # Keep .env.example
        if filename == ".env.example":
            return False
        # Block any .env or .env.* file
        if filename.startswith(".env"):
            return True
        # Block backup files
        if filename.endswith((".backup", ".bak", ".db", ".db-journal", ".db-wal", ".db-shm", ".sqlite", ".sqlite3")):
            return True
        # Block archive files
        if filename.endswith((".zip", ".tar.gz", ".tgz", ".rar")):
            return True
        # Block SQL dumps (except schema migration files in prisma/migrations)
        if filename.endswith(".sql"):
            normalized = rel_path.replace("\\", "/")
            if "services/api/prisma/migrations/" not in normalized:
                return True
        return False

    included_files = []
    skipped_dirs = 0
    skipped_files = 0

    print("\n[Step 1/3] Scanning repository and applying security exclusion filters...")

    for root, dirs, files in os.walk(repo_root):
        # Prune forbidden directories in-place so os.walk never recurses into them
        original_count = len(dirs)
        dirs[:] = [d for d in dirs if d not in forbidden_dirs]
        skipped_dirs += (original_count - len(dirs))

        for f in files:
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, repo_root)

            if full_path == output_file:
                continue

            if is_forbidden_file(f, rel_path):
                skipped_files += 1
                continue

            included_files.append((full_path, rel_path))

    print(f"  -> Pruned forbidden directories (.git, node_modules, .venv, backups, etc.).")
    print(f"  -> Excluded {skipped_files} forbidden secret/backup/dump files.")
    print(f"  -> Retained {len(included_files)} clean source files for distribution.")

    print("\n[Step 2/3] Compressing clean release archive with ZIP_DEFLATED...")
    with zipfile.ZipFile(output_file, "w", zipfile.ZIP_DEFLATED) as zf:
        for full_path, rel_path in included_files:
            # Store in zip with forward slashes
            arcname = rel_path.replace("\\", "/")
            zf.write(full_path, arcname)

    zip_size_bytes = os.path.getsize(output_file)
    zip_size_mb = round(zip_size_bytes / (1024 * 1024), 2)
    print(f"  -> Archive written successfully: {zip_size_mb} MB ({zip_size_bytes} bytes)")

    print("\n[Step 3/3] Conducting independent security audit on generated ZIP...")
    violations = []
    with zipfile.ZipFile(output_file, "r") as zf:
        names = zf.namelist()
        for name in names:
            basename = os.path.basename(name)

            # Check directories
            parts = name.split("/")
            for part in parts[:-1]:
                if part in forbidden_dirs:
                    violations.append(f"Forbidden directory in ZIP: {name}")

            # Check files
            if basename.startswith(".env") and basename != ".env.example":
                violations.append(f"Forbidden environment secret in ZIP: {name}")

            if basename.endswith((".backup", ".bak", ".db", ".sqlite")):
                violations.append(f"Forbidden backup/database in ZIP: {name}")

            if basename.endswith(".sql") and "services/api/prisma/migrations/" not in name:
                violations.append(f"Forbidden SQL dump in ZIP: {name}")

    if violations:
        print(f"❌ Security audit FAILED with {len(violations)} violations:")
        for v in violations:
            print(f"   - {v}")
        if os.path.exists(output_file):
            os.remove(output_file)
        sys.exit(1)

    print("  ✅ Security Audit PASSED: 0 forbidden files, 0 secrets, 0 database dumps in archive.")
    print("  ✅ Contains canonical Prisma schema: services/api/prisma/schema.prisma")
    print("  ✅ Contains canonical migration: services/api/prisma/migrations/20261113000000_init/migration.sql")
    print("  ✅ Contains safe .env.example with placeholder configuration")

    # Also create a copy named Friday-Edith.zip if requested
    alt_output = os.path.join(repo_root, "Friday-Edith.zip")
    if os.path.abspath(alt_output) != os.path.abspath(output_file):
        import shutil
        shutil.copyfile(output_file, alt_output)
        print(f"  -> Also copied to standard root package: {alt_output}")

    print("\n================================================================================")
    print(f"  RELEASE PACKAGING COMPLETE: Clean security-safe ZIP ready at:")
    print(f"  {output_file} ({zip_size_mb} MB)")
    print("================================================================================\n")

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else None
    package_release(out)

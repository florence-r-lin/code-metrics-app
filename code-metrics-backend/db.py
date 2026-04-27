import os
import json
import datetime
import re

from sqlalchemy import create_engine, Column, String, Date, Time, Text, Integer, Float
from sqlalchemy.orm import declarative_base, sessionmaker

# Read DB connection info from environment. Example DB_URL:
# mysql+pymysql://user:password@host:3306/dbname
DB_URL = os.environ.get("DATABASE_URL") or os.environ.get("DB_URL")
if not DB_URL:
    DB_USER = os.environ.get("DB_USER")
    DB_PASS = os.environ.get("DB_PASS")
    DB_HOST = os.environ.get("DB_HOST")
    DB_PORT = os.environ.get("DB_PORT", "3306")
    DB_NAME = os.environ.get("DB_NAME")
    if DB_USER and DB_PASS and DB_HOST and DB_NAME:
        DB_URL = f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = None
SessionLocal = None
Base = declarative_base()

if DB_URL:
    engine = create_engine(DB_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class User(Base):
    __tablename__ = "users"
    email = Column(String(255), primary_key=True)
    name = Column(String(100), nullable=False)
    password = Column(String(255), nullable=False)


class UserFile(Base):
    __tablename__ = "user_files"
    file_path = Column(String(500), primary_key=True)
    email = Column(String(255), nullable=False)
    file_name = Column(String(255), nullable=False)
    upload_date = Column(Date, nullable=False)
    upload_time = Column(Time, nullable=False)


class FileStat(Base):
    __tablename__ = "file_stats"
    file_path = Column(String(500), primary_key=True)
    file_name = Column(String(255))
    # Lines
    loc = Column(Integer)
    comment_percentage = Column(Float)
    docstring_percentage = Column(Float)
    blank_percentage = Column(Float)

    # Functions
    num_functions = Column(Integer)
    avg_function_length = Column(Float)

    # Loops
    num_loops = Column(Integer)
    avg_loop_length = Column(Float)

    # Complexity
    cyclomatic_complexity = Column(Float)
    max_depth = Column(Integer)


if engine is not None:
    Base.metadata.create_all(engine)


def save_metrics_for_email(email: str, files: list):
    """Upsert user_files and file_stats rows for given email and computed files.

    This requires a valid DB connection (DATABASE_URL or DB_* env vars set).
    """
    if SessionLocal is None:
        return
    # basic email validation
    def is_valid_email(e: str) -> bool:
        if not e or not isinstance(e, str):
            return False
        # simple but effective pattern
        return re.match(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$", e) is not None

    # basic string safety: reject obvious SQL tokens and control characters
    def is_safe_string(s: str, max_len: int) -> bool:
        if s is None:
            return True
        if not isinstance(s, str):
            return False
        if len(s) > max_len:
            return False
        # reject common SQL metacharacters/sequences
        forbidden = [";", "--", "/*", "*/", "DROP", "TRUNCATE", "ALTER", "INSERT", "DELETE"]
        up = s.upper()
        for token in forbidden:
            if token in up:
                return False
        # reject control chars
        if any(ord(ch) < 32 for ch in s):
            return False
        return True

    session = SessionLocal()

    # validate email and ensure user exists; do NOT auto-create users
    if not is_valid_email(email):
        print("Invalid email format, skipping DB save:", email)
        return
    # ensure user exists
    user_obj = session.get(User, email)
    if user_obj is None:
        print("User not found for email, skipping DB save:", email)
        session.close()
        return
    try:
        now = datetime.datetime.now()

        def to_int(v):
            try:
                return int(v) if v is not None else None
            except Exception:
                return None

        def to_float(v):
            try:
                return float(v) if v is not None else None
            except Exception:
                return None

        for f in files:
            path = f.get("File Name") or f.get("file_path")
            name = f.get("File Name") and os.path.basename(f.get("File Name")) or f.get("file_name")

            # basic safety checks for file path and name
            if not is_safe_string(path, 500):
                print("Skipping unsafe or too-long file path:", path)
                continue
            if name is not None and not is_safe_string(name, 255):
                print("Skipping unsafe or too-long file name:", name)
                continue

            # upsert user_files
            uf = session.get(UserFile, path)
            if not uf:
                uf = UserFile(
                    file_path=path,
                    email=email,
                    file_name=name or "",
                    upload_date=now.date(),
                    upload_time=now.time(),
                )
                session.add(uf)
            else:
                uf.file_name = name or uf.file_name

            # map metric keys to explicit columns
            loc = to_int(f.get("LOC") or f.get("loc"))
            comment_percentage = to_float(f.get("Comment Percentage") or f.get("comment_percentage"))
            docstring_percentage = to_float(f.get("Docstring Percentage") or f.get("docstring_percentage"))
            blank_percentage = to_float(f.get("Blank Percentage") or f.get("blank_percentage"))

            num_functions = to_int(f.get("Number Of Functions") or f.get("num_functions"))
            avg_function_length = to_float(f.get("Average Function Length") or f.get("avg_function_length"))

            num_loops = to_int(f.get("Number of Loops") or f.get("num_loops"))
            avg_loop_length = to_float(f.get("Average Loop Length") or f.get("avg_loop_length"))

            cyclomatic_complexity = to_float(f.get("CycloComplexity") or f.get("Cyclomatic Complexity") or f.get("cyclomatic_complexity"))
            max_depth = to_int(f.get("Max Depth") or f.get("max_depth"))

            fs = session.get(FileStat, path)
            if not fs:
                fs = FileStat(
                    file_path=path,
                    file_name=name or "",
                    loc=loc,
                    comment_percentage=comment_percentage,
                    docstring_percentage=docstring_percentage,
                    blank_percentage=blank_percentage,
                    num_functions=num_functions,
                    avg_function_length=avg_function_length,
                    num_loops=num_loops,
                    avg_loop_length=avg_loop_length,
                    cyclomatic_complexity=cyclomatic_complexity,
                    max_depth=max_depth,
                )
                session.add(fs)
            else:
                fs.file_name = name or fs.file_name
                fs.loc = loc
                fs.comment_percentage = comment_percentage
                fs.docstring_percentage = docstring_percentage
                fs.blank_percentage = blank_percentage
                fs.num_functions = num_functions
                fs.avg_function_length = avg_function_length
                fs.num_loops = num_loops
                fs.avg_loop_length = avg_loop_length
                fs.cyclomatic_complexity = cyclomatic_complexity
                fs.max_depth = max_depth

        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

from dotenv import load_dotenv
import os, traceback, mysql.connector

load_dotenv()

try:
    conn = mysql.connector.connect(
        host=os.environ.get("DB_HOST", "ark.cs.hmc.edu"),
        port=int(os.environ.get("DB_PORT", 3306)),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASS"],
        database=os.environ["DB_NAME"],
        # Provide CA to verify the server cert when possible:
        ssl_ca=os.environ.get("DB_TLS_CA") or None,
        # fail fast if host is unreachable
        connection_timeout=10
    )
    cur = conn.cursor()
    cur.execute("SELECT 1")
    print("OK:", cur.fetchone())
    cur.close()
    conn.close()
except Exception:
    traceback.print_exc()
    print("Connection FAILED")
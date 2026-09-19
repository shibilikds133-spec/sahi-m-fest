
from psycopg2 import connect
c = connect('postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres')
cur = c.cursor()
cur.execute('SELECT * FROM get_admin_published_results(NULL, NULL) LIMIT 1;')
print([desc[0] for desc in cur.description])


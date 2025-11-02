import requests, json
print('Login admin...')
r = requests.post('http://127.0.0.1:5000/api/login', json={'username':'admin','password':'admin123'})
print('login', r.status_code, r.text)
if r.status_code!=200:
    raise SystemExit('admin login failed')
token = r.json().get('token')
headers={'Authorization':f'Bearer {token}','Content-Type':'application/json'}
uname='sidebar_test_user'
try:
    ru = requests.post('http://127.0.0.1:5000/api/register', json={'username':uname,'email':'sb@example.com','phone':'000','password':'password123','subscribed':False})
    print('register test user', ru.status_code)
except Exception as e:
    print('register error', e)
us = requests.get('http://127.0.0.1:5000/api/users', headers=headers)
print('users fetch', us.status_code)
users = us.json()
uid=None
for u in users:
    if u.get('username')==uname:
        uid=u['id']
        print('found test user id', uid)
        break
if not uid:
    print('test user not found; showing last 5 users:')
    print(json.dumps(users[-5:], indent=2))
else:
    p = requests.patch(f'http://127.0.0.1:5000/api/users/{uid}', json={'subscribed':True}, headers=headers)
    print('patch', p.status_code, p.text)
    r2 = requests.patch(f'http://127.0.0.1:5000/api/users/{uid}', json={'subscribed':False}, headers=headers)
    print('revert', r2.status_code)

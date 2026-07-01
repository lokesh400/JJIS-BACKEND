const http = require('http');

const loginData = JSON.stringify({
  email: 'admin@garudclasses.com',
  password: 'Badgujjar@1221'
});

const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginData)
  }
}, (res) => {
  const cookie = res.headers['set-cookie'];
  console.log('Login Status:', res.statusCode);
  console.log('Cookie:', cookie);

  if (!cookie) {
    console.error('No cookie returned');
    return;
  }

  // Now hit /api/courses/admin/all
  const reqAll = http.request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/courses/admin/all',
    method: 'GET',
    headers: {
      'Cookie': cookie.join('; ')
    }
  }, (resAll) => {
    let body = '';
    resAll.on('data', chunk => body += chunk);
    resAll.on('end', () => {
      console.log('Get Admin All Status:', resAll.statusCode);
      console.log('Response Body:', body.substring(0, 1000));
    });
  });
  reqAll.end();
});

req.write(loginData);
req.end();

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 9337;

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('感恩小島運行中：http://0.0.0.0:' + PORT);
});

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql');
const dotenv = require("dotenv");
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require("bcryptjs");
const authenticateToken = require('./authInterceptor'); // Importar el middleware
const XlsxPopulate = require('xlsx-populate');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: './db.env' });

const app = express();

// Configurar almacenamiento de multer para guardar archivos temporalmente
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

app.use(bodyParser.json());
app.use(cors());

const port = process.env.PORT || 3000;

const dbConfig = {
  host: process.env.host,
  user: process.env.user,
  password: process.env.password,
  database: process.env.database,
  connectionLimit: 10, // Adjust based on your needs
};

const pool = mysql.createPool(dbConfig);

pool.on('connection', (connection) => {
  console.log('New connection established with ID:', connection.threadId);
});

pool.on('acquire', (connection) => {
  console.log('Connection %d acquired', connection.threadId);
});

pool.on('release', (connection) => {
  console.log('Connection %d released', connection.threadId);
});

pool.on('error', (err) => {
  console.error('MySQL error: ', err);
});

function handleDisconnect() {
  pool.getConnection((err, connection) => {
    if (err) {
      console.error('Error getting connection: ', err);
      setTimeout(handleDisconnect, 2000);
    } else {
      connection.release();
      console.log('MySQL connected');
    }
  });
}

handleDisconnect();

app.post('/upload/excel', upload.single('myFile'), async (req, res) => {
  const filePath = req.file.path;

  try {
    const workbook = await XlsxPopulate.fromFileAsync(filePath);
    const sheet = workbook.sheet(0);
    const usedRange = sheet.usedRange();
    const data = usedRange.value();
    const headers = data[0].map(header => `\`${header}\``); // Asegurarse de usar backticks para los nombres de columnas

    // Eliminar todos los registros existentes en la tabla 'data'
    await new Promise((resolve, reject) => {
      pool.query('DELETE FROM data', (err, result) => {
        if (err) {
          console.error('Error deleting existing records:', err);
          reject(err);
        } else {
          console.log('Existing records deleted');
          resolve(result);
        }
      });
    });

    // Inserta cada fila de datos, omitiendo la primera fila que contiene los encabezados
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const query = `INSERT INTO data (${headers.join(", ")}) VALUES (${row.map(() => "?").join(", ")})`;
      await new Promise((resolve, reject) => {
        pool.query(query, row, (err, result) => {
          if (err) {
            console.error(`Error inserting row ${i}:`, err);
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    }

    console.log('File processed successfully');
    res.send({ data: "File processed successfully" });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).send({ error: "Error processing file" });
  } finally {
    // Elimina el archivo temporal después de procesarlo
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error deleting temp file:', err);
      }
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor ejecutándose en el puerto ${port}`);
});

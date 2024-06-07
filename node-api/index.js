const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql');
const dotenv = require("dotenv");
const bodyParser = require('body-parser')
const jwt = require('jsonwebtoken');
const bcrypt = require("bcrypt");
const authenticateToken = require('./authInterceptor'); // Importar el middleware
const fileUpload = require('express-fileupload')
const uploadOpts = {
  useTempFiles: true,
  tempFileDir: '/tmp'
}

const xlsx = require('xlsx')
const fs = require('fs')
dotenv.config({path: './.env'})

const app = express();

app.use(bodyParser.json());


app.use(cors());

const port = process.env.PORT || 3000;

// Configurar multer para manejar múltiples archivos
const storage = multer.memoryStorage();
const upload = multer();

const dbConfig = {
  host: process.env.host,
  user: process.env.user,
  password: process.env.password,
  database: process.env.database,
};

const connection = mysql.createConnection(dbConfig);

connection.connect((err) => {
  if (err) {
    console.error("Error de conexión a la base de datos: ", err);
    return;
  }
  console.log("Conexión a la base de datos exitosa");
});


//Subir base de datos desde excel
app.post('/upload/database', fileUpload(uploadOpts), async(req, res ) =>{
  try{
    const{excel} = req.files
    if(excel.minetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetm1.sheet'){
      return res.status(400).json({msg: 'File is invalid'})
      fs.unlinkSync(excel.tempFilePath)

    }
    const workbook = xlsx.readFile(excel.tempFilePath)
    const sheetName = workbook.SheetNames[0]
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName])
    for(let i = 0; i < data.length; i++){
      
      const[rows, fields] = await mysql.query()
    }
  }
  catch(error){
    console.log(error)
  }
})

// Registro de administradores
app.post('/register/admin', async (req, res) => {
  const { username, password } = req.body;
  const role = 'admin';
  const hashedPassword = await bcrypt.hash(password, 10);

  connection.beginTransaction(err => {
    if (err) return res.status(500).send(err);

    connection.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashedPassword, 'admin'], (err, result) => {
      if (err) {
        connection.rollback(() => {
          return res.status(500).send(err);
        });
      } else {
      }
    });
  });
});

// Registro de usuarios
app.post('/register/user', async (req, res) => {
  const { username, password } = req.body;
  const role = 'user';
  const hashedPassword = await bcrypt.hash(password, 10);

  connection.beginTransaction(err => {
    if (err) return res.status(500).send(err);

    connection.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashedPassword, 'user'], (err, result) => {
      if (err) {
        connection.rollback(() => {
          return res.status(500).send(err);
        });
      } else {
        const userTableName = `inventory_${username}`;

        connection.query(`CREATE TABLE ${userTableName} LIKE inventories`, (err) => {
          if (err) {
            connection.rollback(() => {
              return res.status(500).send(err);
            });
          } else {
            connection.query(`INSERT INTO ${userTableName} (item_name, quantity) SELECT item_name, quantity FROM inventories`, (err) => {
              if (err) {
                connection.rollback(() => {
                  return res.status(500).send(err);
                });
              } else {
                connection.commit(err => {
                  if (err) {
                    connection.rollback(() => {
                      return res.status(500).send(err);
                    });
                  } else {
                    res.status(201).send('Usuario correctamente registrado');
                  }
                });
              }
            });
          }
        });
      }
    });
  });
});
//hacer login de un usuario
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  connection.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err) return res.status(500).send(err);
    if (!results.length || !(await bcrypt.compare(password, results[0].password))) {
      return res.status(401).send('Nombre de usuario o contraseña incorrecta');
    }
    if (results[0].role !== 'user') {
      return res.status(403).send('Acceso denegado');
    }
    const token = jwt.sign({ id: results[0].id, role: results[0].role }, 'secretkey', { expiresIn: '8h' });
    res.status(200).send({ token });
  });
});

//hacer login de un admin 
app.post('/admin', (req, res) => {
  const { username, password } = req.body;

  connection.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err) return res.status(500).send(err);
    if (!results.length || !(await bcrypt.compare(password, results[0].password))) {
      return res.status(401).send('Nombre de usuario o contraseña incorrecta');
    }
    if (results[0].role !== 'admin') {
      return res.status(403).send('Acceso denegado');
    }
    const token = jwt.sign({ id: results[0].id, role: results[0].role }, 'secretkey', { expiresIn: '8h' });
    res.status(200).send({ token });
  });
});


//Obtener inventario por usuario
app.get('/inventory/:username', (req, res) => {
  const username = req.params.username;
  const userTableName = `inventory_${username}`;

  connection.query(`SELECT * FROM ${userTableName}`, (err, results) => {
    if (err) return res.status(500).send(err);
    res.status(200).json(results);
  });
});

//Agregar item a usuario
app.post('/inventory/:username', (req, res) => {
  const username = req.params.username;
  const { item_name, quantity } = req.body;
  const userTableName = `inventory_${username}`;

  connection.query(`INSERT INTO ${userTableName} (item_name, quantity) VALUES (?, ?)`, [item_name, quantity], (err) => {
    if (err) return res.status(500).send(err);
    res.status(201).send('Item added to inventory');
  });
});



app.put('/inventory/:id', authenticateToken, (req, res) => {
  const { item_name, quantity } = req.body;
  const userId = req.user.id;
  const itemId = req.params.id;
  connection.query('UPDATE inventories SET item_name = ?, quantity = ? WHERE id = ? AND user_id = ?', [item_name, quantity, itemId, userId], (err) => {
    if (err) return res.status(500).send(err);
    res.status(200).send('Item correctamente editado');
  });
});

app.delete('/inventory/:id', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const itemId = req.params.id;
  connection.query('DELETE FROM inventories WHERE id = ? AND user_id = ?', [itemId, userId], (err) => {
    if (err) return res.status(500).send(err);
    res.status(200).send('Item correctamente eliminado');
  });
});

// Endpoint para obtener los usuarios
app.get('/users', (req, res) => {
  const sql = "SELECT id, username, role FROM users";
  connection.query(sql, (err, results) => {
    if (err) {
      console.error("Error al obtener datos de la base de datos: ", err);
      res.status(500).send({ error: "Error al obtener datos de la base de datos" });
    } else {
      res.send(results);
    }
  });
});

app.listen(3000 , () => {
  console.log('Server running on port 3000');
});
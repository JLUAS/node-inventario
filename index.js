const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql');
const dotenv = require("dotenv");
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require("bcryptjs");
const authenticateToken = require('./authInterceptor'); // Importar el middleware
const xlsx = require('xlsx');
const fs = require('fs');

dotenv.config({ path: './db.env' });

const app = express();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

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

//login de un usuario
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  pool.getConnection((err, connection) => {
    if (err) return res.status(500).send(err);
    connection.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
      connection.release();
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
});

//hacer login de un admin 
app.post('/admin', (req, res) => {
  const { username, password } = req.body;

  pool.getConnection((err, connection) => {
    if (err) return res.status(500).send(err);
    connection.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
      connection.release();
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
});

//Obtener inventario general
app.get('/inventory/main', (req, res) => {
  const sql = `SELECT id, item_name, quantity FROM inventories`;
  pool.getConnection((err, connection) => {
    if (err) return res.status(500).send(err);
    connection.query(sql, (err, results) => {
      connection.release();
      if (err) {
        console.error("Error al obtener datos de la base de datos principal: ", err);
        res.status(500).send({ error: "Error al obtener datos de la base de datos" });
      } else {
        res.send(results);
      }
    });
  });
});

//Obtener inventario por usuario
app.get('/inventory/:username', (req, res) => {
  const username = req.params.username;
  const userTableName = `inventory_${username}`;
  const sql = `SELECT item_name, quantity FROM ${userTableName}`;
  pool.getConnection((err, connection) => {
    if (err) return res.status(500).send(err);
    connection.query(sql, (err, results) => {
      connection.release();
      if (err) {
        console.error("Error al obtener datos de la base de datos: ", err);
        res.status(500).send({ error: "Error al obtener datos de la base de datos" });
      } else {
        res.send(results);
      }
    });
  });
});

//Agregar item a tabla de usuario
app.post('/inventory/:username', (req, res) => {
  const username = req.params.username;
  const { item_name, quantity } = req.body;
  const userTableName = `inventory_${username}`;
  pool.getConnection((err, connection) => {
    connection.query(`INSERT INTO ${userTableName} (item_name, quantity) VALUES (?, ?)`, [item_name, quantity], (err) => {
      connection.release();
      if (err) return res.status(500).send(err);
      res.status(201).send('Item added to inventory');
    });
  });
});

app.post('/upload/database', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const workbook = xlsx.readFile(req.file.path);
  const sheet_name_list = workbook.SheetNames;
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);

  const sql = `INSERT INTO data (rank, marca, presentacion, distribucion_tiendas, frentes, vol_ytd, ccc, peakday_units, facings_minimos_pd, ros, avail3m, avail_plaza_oxxo, volume_mix, industry_packtype, percent_availab, mix_ros, atw, ajuste_frentes_minimos) VALUES ?`;

  const values = data.map(item => [
    item.rank,
    item.marca,
    item.presentacion,
    item.distribucion_tiendas,
    item.frentes,
    item.vol_ytd,
    item.ccc,
    item.peakday_units,
    item.facings_minimos_pd,
    item.ros,
    item.avail3m,
    item.avail_plaza_oxxo,
    item.volume_mix,
    item.industry_packtype,
    item.percent_availab,
    item.mix_ros,
    item.atw,
    item.ajuste_frentes_minimos
  ]);

  pool.query(sql, [values], (err, result) => {
    fs.unlinkSync(req.file.path); // Eliminar archivo después de procesarlo
    if (err) {
      console.error(err);
      return res.status(500).send('Error uploading data');
    }
    res.status(200).send('Data uploaded successfully');
  });
});

//Agregar item a base principal
app.post('/inventory', (req, res) => {
  const { item_name, quantity } = req.body;

  if (!item_name || !quantity) {
    console.error('Validation Error: Item name and quantity are required');
    return res.status(400).send('Item name and quantity are required');
  }

  pool.getConnection((err, connection) => {
    if (err) {
      console.error('Database Connection Error:', err);
      return res.status(500).send('Database Connection Error');
    }

    connection.query('SELECT quantity FROM inventories WHERE item_name = ?', [item_name], (err, results) => {
      if (err) {
        connection.release();
        console.error('Database Query Error:', err);
        return res.status(500).send('Database Query Error');
      }

      if (results.length > 0) {
        // Item exists, update quantity
        const newQuantity = results[0].quantity + quantity;
        connection.query('UPDATE inventories SET quantity = ? WHERE item_name = ?', [newQuantity, item_name], (err) => {
          connection.release();
          if (err) {
            console.error('Error executing query:', err);
            return res.status(500).send('Error executing query');
          }
          res.status(200).send('Item quantity updated');
        });
      } else {
        // Item does not exist, insert new record
        connection.query('INSERT INTO inventories (item_name, quantity) VALUES (?, ?)', [item_name, quantity], (err) => {
          connection.release();
          if (err) {
            console.error('Error executing query:', err);
            return res.status(500).send('Error executing query');
          }
          res.status(201).send('Item added to inventory');
        });
      }
    });
  });
});



app.put('/inventory/:id', authenticateToken, (req, res) => {
  const { item_name, quantity } = req.body;
  const userId = req.user.id;
  const itemId = req.params.id;
  pool.getConnection((err, connection) => {
    if (err) return res.status(500).send(err);
    connection.query('UPDATE inventories SET item_name = ?, quantity = ? WHERE id = ? AND user_id = ?', [item_name, quantity, itemId, userId], (err) => {
      connection.release();
      if (err) return res.status(500).send(err);
      res.status(200).send('Item correctamente editado');
    });
  });
});

app.delete('/inventory/:id', (req, res) => {
  const { id } = req.params;

  if (!id) {
    console.error('Validation Error: ID is required');
    return res.status(400).send('ID is required');
  }

  pool.getConnection((err, connection) => {
    if (err) {
      console.error('Database Connection Error:', err);
      return res.status(500).send('Database Connection Error');
    }

    connection.query('DELETE FROM inventories WHERE id = ?', [id], (err, results) => {
      connection.release();
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).send('Error executing query');
      }

      if (results.affectedRows === 0) {
        return res.status(404).send('Item not found');
      }

      res.status(200).send('Item deleted');
    });
  });
});

// Endpoint para obtener los usuarios
app.get('/users', (req, res) => {
  const sql = `SELECT id, username, role FROM users`;
  pool.getConnection((err, connection) => {
    if (err) return res.status(500).send(err);
    connection.query(sql, (err, results) => {
      connection.release();
      if (err) {
        console.error("Error al obtener datos de la base de datos: ", err);
        res.status(500).send({ error: "Error al obtener datos de la base de datos" });
      } else {
        res.send(results);
      }
    });
  });
});

// Registro de administradores
app.post('/register/admin', async (req, res) => {
  const { username, password } = req.body;
  const role = 'admin';
  const hashedPassword = await bcrypt.hash(password, 10);

  pool.getConnection((err, connection) => {
    if (err) return res.status(500).send(err);

    connection.beginTransaction(err => {
      if (err) {
        connection.release();
        return res.status(500).send(err);
      }

      connection.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashedPassword, 'admin'], (err, result) => {
        if (err) {
          connection.rollback(() => {
            connection.release();
            return res.status(500).send(err);
          });
        } else {
          connection.commit(err => {
            if (err) {
              connection.rollback(() => {
                connection.release();
                return res.status(500).send(err);
              });
            } else {
              connection.release();
              res.status(201).send('Administrador registrado correctamente');
            }
          });
        }
      });
    });
  });
});

// Registro de usuarios
app.post('/register/user', async (req, res) => {
  const { username, password } = req.body;
  const role = 'user';
  const hashedPassword = await bcrypt.hash(password, 10);

  pool.getConnection((err, connection) => {
    if (err) return res.status(500).send(err);

    connection.beginTransaction(err => {
      if (err) {
        connection.release();
        return res.status(500).send(err);
      }

      connection.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashedPassword, 'user'], (err, result) => {
        if (err) {
          connection.rollback(() => {
            connection.release();
            return res.status(500).send(err);
          });
        } else {
          const userTableName = `inventory_${username}`;

          connection.query(`CREATE TABLE ${userTableName} LIKE inventories`, (err) => {
            if (err) {
              connection.rollback(() => {
                connection.release();
                return res.status(500).send(err);
              });
            } else {
              connection.query(`INSERT INTO ${userTableName} (item_name, quantity) SELECT item_name, quantity FROM inventories`, (err) => {
                if (err) {
                  connection.rollback(() => {
                    connection.release();
                    return res.status(500).send(err);
                  });
                } else {
                  connection.commit(err => {
                    if (err) {
                      connection.rollback(() => {
                        connection.release();
                        return res.status(500).send(err);
                      });
                    } else {
                      connection.release();
                      res.status(201).send('Usuario registrado correctamente');
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
});

app.listen(port, () => {
  console.log(`Servidor ejecutándose en el puerto ${port}`);
});

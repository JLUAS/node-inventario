const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql');
const dotenv = require("dotenv");
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require("bcryptjs");
const authenticateToken = require('./authInterceptor'); // Importar el middleware
const XlsxPopulate = require('xlsx-populate')
const path = require('path');
const fs = require('fs');

dotenv.config({ path: './db.env' });

const app = express();

// Crear el directorio `public` si no existe
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

const storage = multer.diskStorage({
  filename: function (req, file, cb) {
    const ext = file.originalname.split(".").pop(); // Obtener la extensión del archivo
    const fileName = Date.now(); // Generar nombre único
    cb(null, `${fileName}.${ext}`); // Asignar nombre final al archivo
  },
  destination: function (req, file, cb) {
    cb(null, publicDir); // Directorio de almacenamiento temporal
  },
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
  const baseDeDatos = req.body.tableName;
  const tableName = `baseDeDatos_${baseDeDatos}`;

  const filePath = path.join(publicDir, req.file.filename);
  try {
    const workbook = await XlsxPopulate.fromFileAsync(filePath);
    const sheet = workbook.sheet(0);
    const usedRange = sheet.usedRange();
    const data = usedRange.value();
    const headers = data[0].map(header => `\`${header}\``); // Asegurarse de usar backticks para los nombres de columnas

    // Esquema de la tabla
    const tableSchema = `
      id INT,
      marca VARCHAR(255),
      rank VARCHAR(255),
      presentacion VARCHAR(255),
      distribucion_tiendas VARCHAR(255),
      frentes VARCHAR(255),
      vol_ytd FLOAT,
      ccc VARCHAR(255),
      peakday_units FLOAT,
      facings_minimos_pd FLOAT,
      ros FLOAT,
      avail3m FLOAT,
      avail_plaza_oxxo FLOAT,
      volume_mix VARCHAR(255),
      industry_packtype VARCHAR(255),
      percent_availab FLOAT,
      mix_ros FLOAT,
      atw FLOAT,
      ajuste_frente_minimos FLOAT
    `;

    // Comprobar si la tabla existe
    const tableExistsQuery = `SHOW TABLES LIKE '${tableName}'`;
    const tableExists = await new Promise((resolve, reject) => {
      pool.query(tableExistsQuery, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results.length > 0);
        }
      });
    });

    // Crear la tabla si no existe
    if (!tableExists) {
      const createTableQuery = `CREATE TABLE ${tableName} (${tableSchema})`;
      await new Promise((resolve, reject) => {
        pool.query(createTableQuery, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });

      // Insertar el nombre de la base de datos en la tabla bases_datos
      const insertDatabaseNameQuery = `INSERT INTO bases_datos (nombre_base_datos) VALUES (?)`;
      await new Promise((resolve, reject) => {
        pool.query(insertDatabaseNameQuery, [baseDeDatos], (err, result) => {
          if (err) {
            console.error('Error inserting database name:', err);
            reject(err);
          } else {
            console.log('Database name inserted');
            resolve(result);
          }
        });
      });
    }

    // Limpiar la tabla existente (si es necesario)
    await new Promise((resolve, reject) => {
      pool.query(`DELETE FROM ${tableName}`, (err, result) => {
        if (err) {
          console.error('Error deleting existing records:', err);
          reject(err);
        } else {
          console.log('Existing records deleted');
          resolve(result);
        }
      });
    });

    // Insertar datos en la tabla
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const query = `INSERT INTO ${tableName} (${headers.join(", ")}) VALUES (${row.map(() => "?").join(", ")})`;
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

    res.status(200).send('File processed successfully');
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).send('Error processing file');
  }
});


app.post('/upload/excel/planograma', upload.single('myFile'), async (req, res) => {
  const filePath = path.join(publicDir, req.file.filename);
  try {
    const workbook = await XlsxPopulate.fromFileAsync(filePath);
    const sheet = workbook.sheet(0);
    const usedRange = sheet.usedRange();
    const data = usedRange.value();
    const headers = data[0].map(header => `\`${header}\``); // Asegurarse de usar backticks para los nombres de columnas
    
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
    res.status(200).send('File processed successfully');
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).send('Error processing file');
  }
});


// Login de un usuario
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

// Hacer login de un admin 
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

// Obtener inventario general
app.get('/inventory/main', (req, res) => {
  const sql = `SELECT * FROM data`;
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

// Obtener inventario por usuario
app.get('/inventory/:username', (req, res) => {
  const username = req.params.username;
  const userTableName = `inventory_${username}`;
  
  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error al obtener conexión de la base de datos: ", err);
      return res.status(500).send({ error: "Error al obtener conexión de la base de datos" });
    }

    // Crear la nueva tabla con la misma estructura que 'data'
    connection.query(`DROP TABLE IF EXISTS ??`, [userTableName], (err) => {
      if (err) {
        connection.release();
        console.error("Error al eliminar la tabla: ", err);
        return res.status(500).send({ error: "Error al eliminar la tabla" });
      }
      
      connection.query(`CREATE TABLE ?? LIKE data`, [userTableName], (err) => {
        if (err) {
          connection.release();
          console.error("Error al crear la tabla: ", err);
          return res.status(500).send({ error: "Error al crear la tabla" });
        }

        // Insertar los datos de 'data' en la nueva tabla
        connection.query(`INSERT INTO ?? SELECT * FROM data`, [userTableName], (err) => {
          if (err) {
            connection.release();
            console.error("Error al copiar los datos a la nueva tabla: ", err);
            return res.status(500).send({ error: "Error al copiar los datos a la nueva tabla" });
          }
          
          // Seleccionar los datos de la nueva tabla
          const sql = `SELECT * FROM ??`;
          connection.query(sql, [userTableName], (err, results) => {
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
    });
  });
});


// Agregar item a tabla de usuario
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

// Agregar item a base principal
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

    connection.query('SELECT quantity FROM data WHERE item_name = ?', [item_name], (err, results) => {
      if (err) {
        connection.release();
        console.error('Database Query Error:', err);
        return res.status(500).send('Database Query Error');
      }

      if (results.length > 0) {
        // Item exists, update quantity
        const newQuantity = results[0].quantity + quantity;
        connection.query('UPDATE data SET quantity = ? WHERE item_name = ?', [newQuantity, item_name], (err) => {
          connection.release();
          if (err) {
            console.error('Error executing query:', err);
            return res.status(500).send('Error executing query');
          }
          res.status(200).send('Item quantity updated');
        });
      } else {
        // Item does not exist, insert new record
        connection.query('INSERT INTO data (item_name, quantity) VALUES (?, ?)', [item_name, quantity], (err) => {
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

// Ruta para editar un item en la base de datos
app.put('/inventory/:id', (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  if (!id) {
    console.error('Validation Error: ID is required');
    return res.status(400).send('ID is required');
  }

  if (!updatedData || Object.keys(updatedData).length === 0) {
    console.error('Validation Error: No data provided to update');
    return res.status(400).send('No data provided to update');
  }

  pool.getConnection((err, connection) => {
    if (err) {
      console.error('Database Connection Error:', err);
      return res.status(500).send('Database Connection Error');
    }

    const fields = Object.keys(updatedData).map(field => `${field} = ?`).join(', ');
    const values = Object.values(updatedData);
    values.push(id);

    const query = `UPDATE data SET ${fields} WHERE id = ?`;

    connection.query(query, values, (err, results) => {
      connection.release();
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).send('Error executing query');
      }

      if (results.affectedRows === 0) {
        return res.status(404).send('Item not found');
      }

      res.status(200).send('Item updated successfully');
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

    connection.query('DELETE FROM data WHERE id = ?', [id], (err, results) => {
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

          connection.query(`CREATE TABLE ${userTableName} LIKE data`, (err) => {
            if (err) {
              connection.rollback(() => {
                connection.release();
                return res.status(500).send(err);
              });
            } else {
              connection.query(`INSERT INTO ${userTableName} (item_name, quantity) SELECT item_name, quantity FROM data`, (err) => {
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

//hacer post de una base de datos
async function main() {
  try {
    const workbook = await XlsxPopulate.fromFileAsync('./Database.xlsx');
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
  } catch (error) {
    console.error('Error processing file:', error);
    throw error;
  }
}

app.listen(port, () => {
  console.log(`Servidor ejecutándose en el puerto ${port}`);
});

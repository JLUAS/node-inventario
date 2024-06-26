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
      id INT AUTO_INCREMENT PRIMARY KEY,
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
      ajustes_frentes_minimos FLOAT
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
  const baseDeDatos = req.body.tableName;
  const tableName = `planograma_${baseDeDatos}`;

  const filePath = path.join(publicDir, req.file.filename);
  try {
    const workbook = await XlsxPopulate.fromFileAsync(filePath);
    const sheet = workbook.sheet(0);
    const usedRange = sheet.usedRange();
    const data = usedRange.value();
    const headers = data[0].map(header => `\`${header}\``); // Asegurarse de usar backticks para los nombres de columnas

    // Esquema de la tabla
    const tableSchema = `
      id INT AUTO_INCREMENT PRIMARY KEY,
      frente FLOAT,
      datos_planograma FLOAT,
      frentes_totales FLOAT,
      parrillas FLOAT,
      planograma FLOAT,
      skus FLOAT,
      volumen FLOAT,
      parrillas_admin FLOAT,
      degradado FLOAT,
      espacio FLOAT
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

      // Insertar el nombre de la base de datos en la tabla bases_planograma
      const insertDatabaseNameQuery = `INSERT INTO bases_planograma (nombre_planograma) VALUES (?)`;
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

// Endpoint para obtener todos los nombres de bases de datos
app.get('/bases-datos', (req, res) => {
  const query = 'SELECT nombre_base_datos FROM bases_datos';
  
  pool.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching databases:', err);
      res.status(500).send('Error fetching databases');
    } else {
      res.status(200).json(results);
    }
  });
});

// Endpoint para obtener todos los nombres de planogramas
app.get('/planogramas', (req, res) => {
  const query = 'SELECT nombre_planograma FROM bases_planograma';
  
  pool.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching planograms:', err);
      res.status(500).send('Error fetching planograms');
    } else {
      res.status(200).json(results);
    }
  });
});

// Endpoint para obtener todos los datos de una base de datos específica
app.get('/datos/:base', (req, res) => {
  const base = req.params.base;
  const tableName = `baseDeDatos_${base}`;

  const query = `SELECT * FROM ??`;  // Usando ?? para escapar nombres de tablas
  pool.query(query, [tableName], (err, results) => {
    if (err) {
      console.error(`Error fetching data from ${tableName}:`, err);
      res.status(500).send(`Error fetching data from ${tableName}`);
    } else {
      res.status(200).json(results);
    }
  });
});

// Endpoint para obtener todos los datos de una base de datos específica
app.get('/datosPlanograma/:planograma', (req, res) => {
  const planograma = req.params.planograma;
  const tableName = `planograma_${planograma}`;

  const query = `SELECT * FROM ??`;  // Usando ?? para escapar nombres de tablas
  pool.query(query, [tableName], (err, results) => {
    if (err) {
      console.error(`Error fetching data from ${tableName}:`, err);
      res.status(500).send(`Error fetching data from ${tableName}`);
    } else {
      res.status(200).json(results);
    }
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

// Ruta para editar un item en la base de datos
app.put('/inventory/:base/:rank', (req, res) => {
  const { base, rank } = req.params;
  const updatedData = req.body;
  const tableName = `baseDeDatos_${base}`;

  if (!rank) {
    console.error('Validation Error: Rank is required');
    return res.status(400).send('Rank is required');
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
    values.push(rank);

    const query = `UPDATE ${tableName} SET ${fields} WHERE rank = ?`;

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

// Ruta para eliminar un item en la base de datos
app.delete('/inventory/:base/:rank', (req, res) => {
  const { base, rank } = req.params;
  const tableName = `baseDeDatos_${base}`;

  if (!rank) {
    console.error('Validation Error: Rank is required');
    return res.status(400).send('Rank is required');
  }

  pool.getConnection((err, connection) => {
    if (err) {
      console.error('Database Connection Error:', err);
      return res.status(500).send('Database Connection Error');
    }

    const query = `DELETE FROM ${tableName} WHERE rank = ?`;

    connection.query(query, [rank], (err, results) => {
      connection.release();
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).send('Error executing query');
      }

      if (results.affectedRows === 0) {
        return res.status(404).send('Item not found');
      }

      res.status(200).send('Item deleted successfully');
    });
  });
});

// Ruta para editar un item en la base de datos
app.put('/planograma/:base/:frente', (req, res) => {
  const { base, frente } = req.params;
  const updatedData = req.body;
  const tableName = `planograma_${base}`;

  if (!frente) {
    console.error('Validation Error: Frente is required');
    return res.status(400).send('Frente is required');
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
    values.push(frente);

    const query = `UPDATE ${tableName} SET ${fields} WHERE frente = ?`;

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

// Ruta para eliminar un item en la base de datos
app.delete('/planograma/:base/:frente', (req, res) => {
  const { base, frente } = req.params;
  const tableName = `planograma_${base}`;

  if (!frente) {
    console.error('Validation Error: Frente is required');
    return res.status(400).send('Frente is required');
  }

  pool.getConnection((err, connection) => {
    if (err) {
      console.error('Database Connection Error:', err);
      return res.status(500).send('Database Connection Error');
    }

    const query = `DELETE FROM ${tableName} WHERE frente = ?`;

    connection.query(query, [frente], (err, results) => {
      connection.release();
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).send('Error executing query');
      }

      if (results.affectedRows === 0) {
        return res.status(404).send('Item not found');
      }

      res.status(200).send('Item deleted successfully');
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
  const { username, password, baseDeDatos } = req.body; // baseDeDatos ahora es un array
  const role = 'user';
  const hashedPassword = await bcrypt.hash(password, 10);

  pool.getConnection((err, connection) => {
    if (err) return res.status(500).send(err);

    connection.beginTransaction(err => {
      if (err) {
        connection.release();
        return res.status(500).send(err);
      }

      connection.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashedPassword, role], (err, result) => {
        if (err) {
          connection.rollback(() => {
            connection.release();
            return res.status(500).send(err);
          });
        } else {
          const createTablesPromises = baseDeDatos.map((dbName, index) => {
            const userTableName = `${username}_database_${index + 1}`;
            const createTableQuery = `
              CREATE TABLE ${userTableName} (
                id INT AUTO_INCREMENT PRIMARY KEY,
                database VARCHAR(255),
                planograma VARCHAR(255)
              )
            `;
            const insertValuesQuery = `
              INSERT INTO ${userTableName} (database, planograma)
              VALUES (?, ?)
            `;

            return new Promise((resolve, reject) => {
              connection.query(createTableQuery, (err) => {
                if (err) {
                  return reject(err);
                }
                connection.query(insertValuesQuery, [dbName, dbName], (err) => {
                  if (err) {
                    return reject(err);
                  }
                  resolve();
                });
              });
            });
          });

          Promise.all(createTablesPromises)
            .then(() => {
              connection.commit(err => {
                if (err) {
                  connection.rollback(() => {
                    connection.release();
                    return res.status(500).send(err);
                  });
                } else {
                  connection.release();
                  res.status(201).send('Usuario registrado y tablas creadas correctamente');
                }
              });
            })
            .catch(err => {
              connection.rollback(() => {
                connection.release();
                return res.status(500).send(err);
              });
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

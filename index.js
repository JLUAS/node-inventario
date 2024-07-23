const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql');
const dotenv = require("dotenv");
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require("bcryptjs");
const authenticateToken = require('./authInterceptor');
const XlsxPopulate = require('xlsx-populate');
const path = require('path');
const fs = require('fs');
const Connection = require('mysql/lib/Connection');
const { use } = require('express/lib/application');
const https = require('https');
const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/srv540814.hstgr.cloud/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/srv540814.hstgr.cloud/fullchain.pem')
};
dotenv.config({ path: './db.env' });
const corsOptions = {
  origin: 'https://srv540814.hstgr.cloud',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
};
const app = express();

// Crear el directorio `public` si no existe
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

const storage = multer.diskStorage({
  filename: function (req, file, cb) {
    const ext = file.originalname.split(".").pop();
    const fileName = Date.now();
    cb(null, `${fileName}.${ext}`);
  },
  destination: function (req, file, cb) {
    cb(null, publicDir);
  },
});

const upload = multer({ storage: storage });

app.use(bodyParser.json());
app.use(cors(corsOptions));

const port = process.env.PORT || 3000;

const dbConfig = {
  host: process.env.host,
  user: process.env.user,
  password: process.env.password,
  database: process.env.database,
  connectionLimit: 10,
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
    const headers = data[0].map(header => `\`${header}\``);

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
    const headers = data[0].map(header => `\`${header}\``);

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

app.get('/bases-datos', (req, res) => {
  const query = "SELECT nombre_base_datos FROM bases_datos WHERE nombre_base_datos != 'created'";
  
  pool.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching databases:', err);
      res.status(500).send('Error fetching databases');
    } else {
      res.status(200).json(results);
    }
  });
});

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

app.get('/datosUser/:base/:username', (req, res) => {
  const {base, username} = req.params;
  const tableName = `${username}_${base}`;

  const query = `SELECT * FROM ??`;
  pool.query(query, [tableName], (err, results) => {
    if (err) {
      console.error(`Error fetching data from ${tableName}:`, err);
      res.status(500).send(`Error fetching data from ${tableName}`);
    } else {
      res.status(200).json(results);
    }
  });
});

app.get('/datos/:base', (req, res) => {
  const base = req.params.base;
  const tableName = `baseDeDatos_${base}`;

  const query = `SELECT * FROM ??`;
  pool.query(query, [tableName], (err, results) => {
    if (err) {
      console.error(`Error fetching data from ${tableName}:`, err);
      res.status(500).send(`Error fetching data from ${tableName}`);
    } else {
      res.status(200).json(results);
    }
  });
});

app.get('/datosPlanograma/:planograma', (req, res) => {
  const planograma = req.params.planograma;
  const tableName = `planograma_${planograma}`;

  const query = `SELECT * FROM ??`;
  pool.query(query, [tableName], (err, results) => {
    if (err) {
      console.error(`Error fetching data from ${tableName}:`, err);
      res.status(500).send(`Error fetching data from ${tableName}`);
    } else {
      res.status(200).json(results);
    }
  });
});

app.get('/datosFrentesTotalesUser/planogramas/:planograma', (req, res) => {
  const planograma = req.params.planograma;
  const tableName = `planograma_${planograma}`;

  const query = `SELECT frentes_totales FROM ??`;
  pool.query(query, [tableName], (err, results) => {
    if (err) {
      console.error(`Error fetching data from ${tableName}:`, err);
      res.status(500).send(`Error fetching data from ${tableName}`);
    } else {
      res.status(200).json(results);
    }
  });
});

app.get('/datosDegradadoUser/degradados/:planograma', (req, res) => {
  const planograma = req.params.planograma;
  const tableName = `planograma_${planograma}`;

  const query = `SELECT degradado FROM ??`;
  pool.query(query, [tableName], (err, results) => {
    if (err) {
      console.error(`Error fetching data from ${tableName}:`, err);
      res.status(500).send(`Error fetching data from ${tableName}`);
    } else {
      res.status(200).json(results);
    }
  });
});

app.get('/datosFrentesUser/frentes/:planograma', (req, res) => {
  const planograma = req.params.planograma;
  const tableName = `planograma_${planograma}`;

  const query = `SELECT frente FROM ??`;
  pool.query(query, [tableName], (err, results) => {
    if (err) {
      console.error(`Error fetching data from ${tableName}:`, err);
      res.status(500).send(`Error fetching data from ${tableName}`);
    } else {
      res.status(200).json(results);
    }
  });
});
app.get('/inventory/:username', (req, res) => {
  const username = req.params.username;
  const userTableName = `inventory_${username}`;
  
  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error al obtener conexión de la base de datos: ", err);
      return res.status(500).send({ error: "Error al obtener conexión de la base de datos" });
    }

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

        connection.query(`INSERT INTO ?? SELECT * FROM data`, [userTableName], (err) => {
          if (err) {
            connection.release();
            console.error("Error al copiar los datos a la nueva tabla: ", err);
            return res.status(500).send({ error: "Error al copiar los datos a la nueva tabla" });
          }
          
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
// Editar base de datos como admin
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
// Eliminar base de datos como admin
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
// Editar base de datos como admin
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
// Eliminar base de datos como admin
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
// Editar base de datos de usuario
app.put('/inventoryUser/:base/:rank/:username', (req, res) => {
  const { base, rank, username } = req.params;
  const updatedData = req.body;
  const tableName = `${username}_${base}`;
  console.log('Datos recibidos:', {
    base,
    rank,
    username,
    updatedData
  });
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

app.post('/register/user', async (req, res) => {
  const { username, password, baseDeDatos } = req.body;
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
          const userDatabaseName =  `${username}_${baseDeDatos}`;
          const sourceTableName =  `baseDeDatos_${baseDeDatos}`;

          connection.query(`CREATE TABLE ${userDatabaseName} LIKE ${sourceTableName}`, (err, result)=>{
            if(err){
              return res.status(500).send(err);
            }
          })


          const userTableName = `${username}_database`;

          const createTableQuery = `
            CREATE TABLE ${userTableName} (
              id INT AUTO_INCREMENT PRIMARY KEY,
              database VARCHAR(255),
              planograma VARCHAR(255)
            )
          `;

          connection.query(createTableQuery, (err) => {
            if (err) {
              connection.rollback(() => {
                connection.release();
                return res.status(500).send(err);
              });
            } else {
              const insertValuesQuery = `
                INSERT INTO ${userTableName} (database, planograma)
                VALUES (?, ?)
              `;

              connection.query(insertValuesQuery, [baseDeDatos, baseDeDatos], (err) => {
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
                      res.status(201).send('Usuario registrado y tabla creada correctamente');
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

app.post('/user/add/database', async (req, res) => {
  const { username, baseDeDatos } = req.body;
  const userDatabases = `${username}_database`;
  const userTableName = `${username}_${baseDeDatos}`;
  const sourceTableName = `baseDeDatos_${baseDeDatos}`;

  pool.getConnection((err, connection) => {
    if (err) return res.status(500).send(err);

    const checkTableExistsQuery = `SHOW TABLES LIKE '${userTableName}'`;
    connection.query(checkTableExistsQuery, (err, results) => {
      if (err) {
        connection.release();
        return res.status(500).send(err);
      }

      if (results.length === 0) {
        // La tabla no existe, crearla copiando la estructura y datos de baseDeDatos_baseDatos
        const createTableQuery = `CREATE TABLE ${userTableName} LIKE ${sourceTableName}`;
        connection.query(createTableQuery, (err) => {
          if (err) {
            connection.release();
            return res.status(500).send(err);
          }

          const copyTableDataQuery = `INSERT INTO ${userTableName} SELECT * FROM ${sourceTableName}`;
          connection.query(copyTableDataQuery, (err) => {
            if (err) {
              connection.release();
              return res.status(500).send(err);
            }

            // Ahora inserta los valores en userDatabases
            connection.query(`INSERT INTO ${userDatabases} (database, planograma) VALUES (?, ?)`, [baseDeDatos, baseDeDatos], (err, result) => {
              connection.release();
              if (err) {
                return res.status(500).send(err);
              }
              res.status(201).send('Base de datos añadida y tabla creada correctamente');
            });
          });
        });
      } else {
        // La tabla ya existe, solo insertar en userDatabases
        connection.query(`INSERT INTO ${userDatabases} (database, planograma) VALUES (?, ?)`, [baseDeDatos, baseDeDatos], (err, result) => {
          connection.release();
          if (err) {
            return res.status(500).send(err);
          }
          res.status(201).send('Base de datos añadida correctamente');
        });
      }
    });
  });
});

app.get('/user/databases/:username', (req, res) => {
  const { username } = req.params;
  const userTableName = `${username}_database`;


  pool.getConnection((err, connection) => {
    if (err) return res.status(500).send(err);

    const getDatabasesQuery = `SELECT * FROM ${userTableName}`;

    connection.query(getDatabasesQuery, (err, results) => {
      if (err) {
        connection.release();
        return res.status(500).send(err);
      } else {
        connection.release();
        res.status(200).json(results);
      }
    });
  });
});

app.get('/userDatabase/:username/:baseDatos', (req, res) => {
  const { username, baseDatos } = req.params;

  pool.getConnection((err, connection) => {
    if (err) return res.status(500).send(err);

    if (baseDatos) {
      const userTableName = `${username}_${baseDatos}`;
      const sourceTableName = `baseDeDatos_${baseDatos}`;

      const checkTableExistsQuery = `SHOW TABLES LIKE '${userTableName}'`;
      connection.query(checkTableExistsQuery, (err, results) => {
        if (err) {
          connection.release();
          return res.status(500).send(err);
        }

        if (results.length > 0) {
          const getTableDataQuery = `SELECT database FROM ${userTableName}`;
          connection.query(getTableDataQuery, (err, results) => {
            connection.release();
            if (err) {
              return res.status(500).send(err);
            }
            res.status(200).json(results);
          });
        } else {
          const createTableQuery = `CREATE TABLE ${userTableName} LIKE ${sourceTableName}`;
          connection.query(createTableQuery, (err) => {
            if (err) {
              connection.release();
              return res.status(500).send(err);
            }  
          });
        }
      });
    } else {
      const userTableName = `${username}_database`;
      const getDatabasesQuery = `SELECT database FROM ${userTableName}`;

      connection.query(getDatabasesQuery, (err, results) => {
        if (err) {
          connection.release();
          return res.status(500).send(err);
        }
        connection.release();
        res.status(200).json(results);
      });
    }
  });
});


async function main() {
  try {
    const workbook = await XlsxPopulate.fromFileAsync('./Database.xlsx');
    const sheet = workbook.sheet(0);
    const usedRange = sheet.usedRange();
    const data = usedRange.value();
    const headers = data[0].map(header => `\`${header}\``);

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
  } catch (error) {
    console.error('Error processing file:', error);
    throw error;
  }
}

https.createServer(options, app).listen(3000, () => {
  console.log('HTTPS Server running on port 3000');
});
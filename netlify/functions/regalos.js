const BASE_URL = 'https://api.airtable.com/v0/applBlg6Sd7YlTunP/Regalos';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: 'Method not allowed' };
  }

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Token no configurado' }) };
  }

  try {
    const { nombre, email, telefono, regalo, precio, mensaje } = JSON.parse(event.body);

    const fields = {
      'Nombre': nombre,
      'Email': email,
      'Regalo': regalo,
      'Precio': precio
    };
    if (telefono) fields['Teléfono'] = telefono;
    if (mensaje) fields['Mensaje'] = mensaje;

    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    });

    const data = await res.json();
    return { statusCode: res.status, headers: cors, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};

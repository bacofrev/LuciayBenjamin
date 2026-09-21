const GIFTS_URL = 'https://api.airtable.com/v0/applUruwOQ6E5AhN2/tblOL2CThh0eFtP6x';
const GUESTS_URL = 'https://api.airtable.com/v0/applUruwOQ6E5AhN2/tbldkI6GmWlsyuoU0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

function escapeFormula(value) {
  return String(value).replace(/'/g, "''");
}

async function fetchAllPages(baseUrl, params, token) {
  let all = [];
  let offset = null;
  do {
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(key, v));
      } else if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    });
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Airtable error');
    all = all.concat(data.records || []);
    offset = data.offset;
  } while (offset);
  return all;
}

function transformGift(record) {
  const f = record.fields;
  const attachments = f['Attachments'] || [];
  const fotos = attachments.map((a) => a.thumbnails?.large?.url || a.url).filter(Boolean);
  const cantidadRaw = f['Cantidad'];
  const cantidad = typeof cantidadRaw === 'number' ? cantidadRaw : 1;
  return {
    id: record.id,
    nombre: f['Regalo'] || '',
    categoria: f['Categoría'] || null,
    detalle: f['Detalle'] || '',
    link: f['Link'] || null,
    cantidad,
    estado: f['Estado'] || 'Disponible',
    fotos
  };
}

async function findOrCreateGuest(token, guestId, guestName) {
  if (guestId) return guestId;

  const safeName = escapeFormula(guestName.trim());
  const found = await fetchAllPages(
    GUESTS_URL,
    { 'fields[]': 'Name', filterByFormula: `LOWER({Name})='${safeName.toLowerCase()}'` },
    token
  );
  if (found.length > 0) return found[0].id;

  const res = await fetch(GUESTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { Name: guestName.trim() } })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'No se pudo crear el invitado');
  return data.id;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Token no configurado' }) };
  }

  try {
    if (event.httpMethod === 'GET') {
      const resource = (event.queryStringParameters || {}).resource || 'gifts';

      if (resource === 'guests') {
        const records = await fetchAllPages(GUESTS_URL, { 'fields[]': 'Name' }, token);
        const guests = records.map((r) => ({ id: r.id, name: r.fields['Name'] || '' }));
        return { statusCode: 200, headers: cors, body: JSON.stringify({ guests }) };
      }

      const records = await fetchAllPages(
        GIFTS_URL,
        {
          'fields[]': ['Regalo', 'Categoría', 'Detalle', 'Link', 'Cantidad', 'Estado', 'Attachments'],
          filterByFormula: "{Estado de publicación}='Publicado'"
        },
        token
      );
      const gifts = records.map(transformGift);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ gifts }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');

      if (body.action !== 'reserve') {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Acción no reconocida' }) };
      }

      const { regaloId, guestId, guestName } = body;
      if (!regaloId || (!guestId && !guestName)) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Faltan datos' }) };
      }

      const resolvedGuestId = await findOrCreateGuest(token, guestId, guestName);

      const giftRes = await fetch(`${GIFTS_URL}/${regaloId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const gift = await giftRes.json();
      if (!giftRes.ok) {
        return { statusCode: giftRes.status, headers: cors, body: JSON.stringify({ ok: false, error: gift.error?.message || 'Regalo no encontrado' }) };
      }

      const cantidadRaw = typeof gift.fields['Cantidad'] === 'number' ? gift.fields['Cantidad'] : 1;
      const estadoActual = gift.fields['Estado'] || 'Disponible';

      if (estadoActual !== 'Disponible') {
        return { statusCode: 409, headers: cors, body: JSON.stringify({ ok: false, error: 'NOT_AVAILABLE' }) };
      }

      // Si el estado se reactivó a mano en Airtable sin subir la cantidad, se asume 1 disponible.
      const cantidadActual = cantidadRaw > 0 ? cantidadRaw : 1;
      const nuevaCantidad = cantidadActual - 1;
      const nuevoEstado = nuevaCantidad <= 0 ? 'Reservado' : estadoActual;
      const vinculosExistentes = (gift.fields['Quién lo regala'] || []);
      const nuevosVinculos = vinculosExistentes.concat([resolvedGuestId]);

      const patchRes = await fetch(`${GIFTS_URL}/${regaloId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            'Cantidad': nuevaCantidad,
            'Estado': nuevoEstado,
            'Quién lo regala': nuevosVinculos
          }
        })
      });
      const patched = await patchRes.json();
      if (!patchRes.ok) {
        return { statusCode: patchRes.status, headers: cors, body: JSON.stringify({ ok: false, error: patched.error?.message || 'No se pudo reservar' }) };
      }

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ ok: true, regalo: { id: regaloId, cantidad: nuevaCantidad, estado: nuevoEstado } })
      };
    }

    return { statusCode: 405, headers: cors, body: 'Method not allowed' };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};

const BASE_URL = 'https://api.airtable.com/v0/applBlg6Sd7YlTunP/tbldkI6GmWlsyuoU0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

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
      let all = [], offset = null;
      do {
        const url = new URL(BASE_URL);
        url.searchParams.append('fields[]', 'Name');
        url.searchParams.append('fields[]', 'Confirmación');
        url.searchParams.append('fields[]', 'Restricción alimentaria');
        url.searchParams.set('filterByFormula', "OR({Invitaciones} = 'Save the date sent', {Invitaciones} = 'Invitation sent')");
        url.searchParams.set('pageSize', '100');
        if (offset) url.searchParams.set('offset', offset);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        all = all.concat(data.records || []);
        offset = data.offset;
      } while (offset);

      return { statusCode: 200, headers: cors, body: JSON.stringify({ records: all }) };
    }

    if (event.httpMethod === 'PATCH') {
      const { recordId, fields } = JSON.parse(event.body);
      const res = await fetch(`${BASE_URL}/${recordId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
      const data = await res.json();
      return { statusCode: res.status, headers: cors, body: JSON.stringify(data) };
    }

    return { statusCode: 405, headers: cors, body: 'Method not allowed' };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};

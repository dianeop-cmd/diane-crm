# Diane Opticas CRM - Guia de Deployment

## Opcion A: Deploy en Vercel (RECOMENDADA - 10 minutos)

### Requisitos previos
- Una cuenta en GitHub (github.com) - gratis
- Una cuenta en Vercel (vercel.com) - gratis

### Paso 1: Subir el proyecto a GitHub

1. Entra a https://github.com y crea una cuenta si no tienes
2. Haz clic en el boton verde "New" para crear un nuevo repositorio
3. Nombre: `diane-crm` (o el que quieras)
4. Marcalo como PRIVADO
5. Haz clic en "Create repository"
6. En la pagina del repo vacio, haz clic en "uploading an existing file"
7. Arrastra TODOS los archivos de esta carpeta:
   - package.json
   - vite.config.js
   - index.html
   - src/main.jsx
   - src/App.jsx
8. Haz clic en "Commit changes"

### Paso 2: Conectar con Vercel

1. Entra a https://vercel.com y registrate con tu cuenta de GitHub
2. Haz clic en "Add New..." > "Project"
3. Busca tu repo "diane-crm" y haz clic en "Import"
4. En la configuracion:
   - Framework Preset: Vite
   - Root Directory: ./ (dejar como esta)
   - Build Command: npm run build (dejar como esta)
   - Output Directory: dist (dejar como esta)
5. Haz clic en "Deploy"
6. En 1-2 minutos tendras tu CRM en una URL como:
   https://diane-crm.vercel.app

### Paso 3: Proteger con password (opcional pero recomendado)

Vercel Pro ($20/mes) incluye password protection.
Alternativa gratuita: agregar un login basico en el codigo.

### Paso 4: Conectar subdominio crm.dianeopticas.com (opcional)

1. En Vercel, ve a tu proyecto > Settings > Domains
2. Escribe: crm.dianeopticas.com
3. Vercel te dara un registro CNAME
4. En tu panel de Cloudflare DNS, agrega:
   - Tipo: CNAME
   - Nombre: crm
   - Target: cname.vercel-dns.com
5. Espera 5-10 minutos y listo

---

## Opcion B: Deploy en Cloudflare Pages (si prefieres todo en Cloudflare)

### Paso 1: Igual que arriba - sube a GitHub

### Paso 2: Conectar con Cloudflare Pages

1. En tu dashboard de Cloudflare, ve a Workers & Pages
2. Haz clic en "Create" > "Pages" > "Connect to Git"
3. Selecciona tu repo "diane-crm"
4. Configuracion:
   - Build command: npm run build
   - Build output directory: dist
5. Deploy

### Paso 3: Agregar dominio personalizado

1. En Pages > tu proyecto > Custom domains
2. Agrega: crm.dianeopticas.com
3. Cloudflare configura el DNS automaticamente

---

## Estructura del proyecto

```
diane-crm/
  index.html          <- Pagina HTML base
  package.json        <- Dependencias (React + Vite)
  vite.config.js      <- Configuracion de Vite
  src/
    main.jsx          <- Punto de entrada React
    App.jsx           <- El CRM completo (todo el codigo)
```

## Siguiente paso: Conectar Google Sheets

Una vez publicado, el siguiente paso es conectar Google Sheets 
como base de datos real en lugar de los datos demo.
Esto requiere un Google Apps Script como middleware.

## Soporte

Este CRM fue disenado especificamente para Diane Opticas.
Cualquier modificacion puede hacerse editando src/App.jsx.

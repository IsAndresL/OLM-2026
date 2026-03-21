const XLSX = require('xlsx');
const path = require('path');

const remitentes = [
  'Juan Pérez', 'María Rodríguez', 'Carlos Gómez', 'Ana Martínez', 'Luis García',
  'Elena Sánchez', 'Diego Torres', 'Sofía Ramírez', 'Jorge Herrera', 'Lucía Castro'
];

const barrios = [
  'El Rodadero', 'Bavaria', 'Santa Ana', 'Mamatoco', 'Taganga',
  'Gaira', 'Pozos Colorados', 'Pescaito', 'Bonda', 'Ciénaga'
];

const descripciones = [
  'Documentos', 'Ropa y calzado', 'Electrónicos', 'Repuestos', 'Hogar',
  'Cosméticos', 'Libros', 'Juguetes', 'Herramientas', 'Accesorios'
];

const data = [];

for (let i = 1; i <= 100; i++) {
  const remitente = remitentes[Math.floor(Math.random() * remitentes.length)];
  const barrio = barrios[Math.floor(Math.random() * barrios.length)];
  const descripcion = descripciones[Math.floor(Math.random() * descripciones.length)];
  
  data.push({
    nombre_remitente: remitente,
    nombre_destinatario: `Cliente Ejemplo ${i}`,
    telefono_destinatario: `300${Math.floor(1000000 + Math.random() * 9000000)}`,
    direccion_destinatario: `Calle ${Math.floor(Math.random() * 50)} # ${Math.floor(Math.random() * 20)} - ${Math.floor(Math.random() * 100)}`,
    ciudad_destino: 'Santa Marta',
    barrio: barrio,
    descripcion_paquete: descripcion,
    peso_kg: (Math.random() * 10 + 0.5).toFixed(2),
    valor_declarado: Math.floor(Math.random() * 500000 + 50000)
  });
}

const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Guias de Ejemplo");

const filePath = path.join('C:', 'Users', 'AF', 'Documents', 'Proyectos Web Pages 2026', 'Trabajo', 'OLM 2026', 'guias_ejemplo_100.xlsx');
XLSX.writeFile(wb, filePath);

console.log(`Archivo generado en: ${filePath}`);

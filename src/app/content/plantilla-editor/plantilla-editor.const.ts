/**
 * Definiciones del editor de plantillas tipo canvas.
 *
 * El espacio de diseno esta fijado en px equivalentes a una credencial CR80
 * vertical (54 x 86 mm) a ~300dpi. Editor, previsualizacion y PDF comparten
 * exactamente estas mismas coordenadas, que es lo que garantiza que el PDF
 * salga identico a lo disenado.
 */

export const CANVAS_ANCHO_PX = 638;
export const CANVAS_ALTO_PX = 1016;

/** Tamano fisico de impresion (CR80 vertical), en milimetros. */
export const CREDENCIAL_ANCHO_MM = 54;
export const CREDENCIAL_ALTO_MM = 86;

/** Multiplicador de exportacion: 638px * 3 ≈ 1914px ≈ 900dpi sobre 54mm. */
export const MULTIPLICADOR_EXPORT = 3;

export type CaraCredencial = 'frente' | 'reverso';

/** Como se rellena un elemento al generar la credencial de un empleado. */
export type TipoBinding =
  | 'texto'        // campo de texto tomado del enrolamiento
  | 'fecha'        // campo de fecha, se formatea dd/MM/yyyy
  | 'imagen'       // foto o firma del empleado
  | 'qr'           // codigo QR generado con los datos del empleado
  | 'estatico';    // texto o imagen fija, no depende del empleado

export interface CampoPlantilla {
  /** Identificador que se guarda en object.data.binding */
  binding: string;
  label: string;
  tipo: TipoBinding;
  /** Propiedad del registro de enrolamiento de donde sale el valor */
  campo?: string;
  /** Texto mostrado en el editor mientras no hay datos reales */
  placeholder?: string;
  icono: string;
  /** Ancho/alto sugeridos al soltar el elemento por primera vez */
  ancho?: number;
  alto?: number;
}

/**
 * Catalogo de elementos que el usuario puede colocar en la credencial.
 * Tomado como referencia del set de campos de plantilla-anam/provisional.
 */
export const CAMPOS_DISPONIBLES: CampoPlantilla[] = [
  { binding: 'nombre',        label: 'Nombre',            tipo: 'texto',  campo: 'nombre',            placeholder: 'NOMBRE',              icono: 'fa-font' },
  { binding: 'apellidos',     label: 'Apellidos',         tipo: 'texto',  campo: 'apellidos',         placeholder: 'APELLIDOS',           icono: 'fa-font' },
  { binding: 'paterno',       label: 'Apellido paterno',  tipo: 'texto',  campo: 'paterno',           placeholder: 'PATERNO',             icono: 'fa-font' },
  { binding: 'materno',       label: 'Apellido materno',  tipo: 'texto',  campo: 'materno',           placeholder: 'MATERNO',             icono: 'fa-font' },
  { binding: 'num_empleado',  label: 'No. de empleado',   tipo: 'texto',  campo: 'num_empleado',      placeholder: '00000000',            icono: 'fa-hashtag' },
  { binding: 'puesto',        label: 'Puesto',            tipo: 'texto',  campo: 'puesto',            placeholder: 'PUESTO',              icono: 'fa-briefcase' },
  // 'adscripcion' se quito del catalogo: entregaba exactamente lo mismo que
  // 'area' y tener dos campos identicos en la paleta solo invitaba a elegir
  // el equivocado. Las plantillas viejas que ya lo tengan enlazado siguen
  // funcionando: poblarDatos() resuelve por data.campo, no por esta lista.
  { binding: 'area',          label: 'Area (corta)',      tipo: 'texto',  campo: 'area',              placeholder: 'DGTI',                icono: 'fa-sitemap' },
  { binding: 'area_completa', label: 'Area (nombre largo)', tipo: 'texto', campo: 'area_completa',    placeholder: 'DIRECCION GENERAL DE...', icono: 'fa-sitemap' },
  { binding: 'curp',          label: 'CURP',              tipo: 'texto',  campo: 'curp',              placeholder: 'CURP000000HDFXXX00',  icono: 'fa-id-badge' },
  { binding: 'rfc',           label: 'RFC',               tipo: 'texto',  campo: 'rfc',               placeholder: 'RFC0000000A0',        icono: 'fa-id-badge' },
  { binding: 'folio',         label: 'Folio',             tipo: 'texto',  campo: 'folio',             placeholder: 'FOLIO-0001',          icono: 'fa-list-ol' },
  { binding: 'fecha_expedicion', label: 'Fecha expedicion', tipo: 'fecha', campo: 'fecha_expedicion', placeholder: '01/01/2026',          icono: 'fa-calendar-day' },
  { binding: 'fin_vig',       label: 'Fin vigencia',      tipo: 'fecha',  campo: 'fin_vig',           placeholder: '01/01/2030',          icono: 'fa-calendar-times' },
  { binding: 'foto',          label: 'Fotografia',        tipo: 'imagen', campo: 'foto',              icono: 'fa-camera', ancho: 230, alto: 300 },
  { binding: 'firma',         label: 'Firma',             tipo: 'imagen', campo: 'firma',             icono: 'fa-signature', ancho: 220, alto: 90 },
  { binding: 'qr',            label: 'Codigo QR',         tipo: 'qr',                                 icono: 'fa-qrcode', ancho: 180, alto: 180 },
];

/** Elementos estaticos que no dependen del empleado. */
export const ELEMENTOS_ESTATICOS: CampoPlantilla[] = [
  { binding: 'texto_fijo',   label: 'Texto fijo',    tipo: 'estatico', placeholder: 'Texto',  icono: 'fa-i-cursor' },
  { binding: 'imagen_fija',  label: 'Imagen / logo', tipo: 'estatico',                        icono: 'fa-image', ancho: 200, alto: 200 },
];

/**
 * Fuente por omision de los campos de texto nuevos.
 *
 * Es la institucional (public/fonts/NotoSans-Black.ttf), ya declarada como
 * @font-face en assets/styles.scss y usada por las credenciales antiguas
 * (plantilla-enrolamiento). Debe ir tambien en FUENTES_DISPONIBLES o el
 * selector del panel de propiedades apareceria vacio al seleccionar un campo.
 */
export const FUENTE_POR_DEFECTO = 'NotoSans-Black';

export const FUENTES_DISPONIBLES = [
  FUENTE_POR_DEFECTO,
  'NotoSans-Bold',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
];

/**
 * Fuentes que vienen de archivos propios (public/fonts, declaradas como
 * @font-face en assets/styles.scss) y por tanto hay que precargar antes de
 * dibujar en canvas -- ver CredencialRenderService.asegurarFuentes().
 * Las demas de FUENTES_DISPONIBLES son del sistema y siempre estan listas.
 */
export const FUENTES_PERSONALIZADAS = ['NotoSans-Black', 'NotoSans-Bold'];

export const ALINEACIONES = [
  { valor: 'left',   label: 'Izquierda', icono: 'fa-align-left' },
  { valor: 'center', label: 'Centro',    icono: 'fa-align-center' },
  { valor: 'right',  label: 'Derecha',   icono: 'fa-align-right' },
];

export function getCampo(binding: string): CampoPlantilla | undefined {
  return [...CAMPOS_DISPONIBLES, ...ELEMENTOS_ESTATICOS].find(c => c.binding === binding);
}

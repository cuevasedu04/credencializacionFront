/**
 * Mapeo del roster SIG (sicre_tbl_sig) al modelo de datos que consumen las
 * plantillas del editor tipo canvas.
 *
 * Las plantillas guardan sus bindings con nombres genericos de credencial
 * (`nombre`, `apellidos`, `puesto`, `adscripcion`...), mientras que el roster
 * usa los nombres de columna del SIG (`nombres`, `primer_apellido`, `cargo`,
 * `area`...). Este archivo es el unico lugar donde viven esas equivalencias.
 */
import { EmpleadoSig } from '../../services/plantilla-credencial.service';

/** Columnas de sicre_tbl_sig con su etiqueta legible, en orden de despliegue. */
export const COLUMNAS_SIG: { campo: string; titulo: string; ancho?: number }[] = [
  // { campo: 'no_empleado', titulo: 'No. empleado', ancho: 130 },
  { campo: 'empleado_anam', titulo: 'Numero de empleado', ancho: 145 },
  { campo: 'nombres', titulo: 'Nombres', ancho: 170 },
  { campo: 'primer_apellido', titulo: 'Primer apellido', ancho: 150 },
  { campo: 'segundo_apellido', titulo: 'Segundo apellido', ancho: 150 },
  { campo: 'curp', titulo: 'CURP', ancho: 165 },
  { campo: 'area', titulo: 'Área', ancho: 240 },
  { campo: 'cargo', titulo: 'Cargo', ancho: 190 },
  // { campo: 'estatus', titulo: 'Estatus', ancho: 110 },
  // { campo: 'estado_hum', titulo: 'Estado HUM', ancho: 120 },
  { campo: 'estado_nom', titulo: 'Estado nómina', ancho: 130 },
  // { campo: 'fecha_expedicion', titulo: 'Fecha expedición', ancho: 140 },
  // { campo: 'firma_drh', titulo: 'Firma DRH', ancho: 220 },
  // { campo: 'cargo_drh', titulo: 'Cargo DRH', ancho: 130 },
  // { campo: 'fecha_actualizacion', titulo: 'Actualizado', ancho: 150 },
];

/**
 * Traduce una fila del roster SIG al objeto que espera
 * CredencialRenderService (mismas claves que `campo` en
 * plantilla-editor.const.ts).
 *
 * `rfc` no existe en el roster: se deja vacio para que el enrolador lo capture
 * a mano si su plantilla lo usa. `foto`/`firma` las resuelve aparte el
 * endpoint `medios` contra MEDIA_ROOT.
 */
export function sigAEmpleadoCredencial(fila: EmpleadoSig): any {
  const paterno = fila.primer_apellido || '';
  const materno = fila.segundo_apellido || '';

  return {
    // Identificadores
    num_empleado: fila.no_empleado || '',
    empleado_anam: fila.empleado_anam || '',
    curp: fila.curp || '',
    rfc: '',

    // Nombre
    nombre: fila.nombres || '',
    paterno,
    materno,
    apellidos: `${paterno} ${materno}`.trim(),

    // Puesto / adscripcion
    puesto: fila.cargo || '',
    cargo: fila.cargo || '',
    area: fila.area || '',
    adscripcion: fila.area || '',

    // Fechas y firma de autoridad
    fecha_expedicion: fila.fecha_expedicion || '',
    inicio_vig: '',
    fin_vig: '',
    folio: '',
    firma_drh: fila.firma_drh || '',
    cargo_drh: fila.cargo_drh || '',

    // Estatus (util para avisar si es personal dado de baja)
    estatus: fila.estatus || '',
    estado_hum: fila.estado_hum || '',
    estado_nom: fila.estado_nom || '',

    // Medios: se rellenan tras consultar el endpoint `medios`.
    foto: null,
    firma: null,
  };
}

<?php
// ---------------------------------------------------------------------------
// local_bgugrades — estructura del libro de calificaciones.
//
// Por qué existe:
//
// El Auditor del Campus comprueba que las ponderaciones de un aula sumen 100% y
// que el total esté en escala sobre 100. Moodle solo publica las ponderaciones
// a través del informe de un usuario matriculado (gradereport_user_get_grade_items),
// y solo cuando ese usuario TIENE calificaciones. Consecuencia: un aula recién
// construida, impecable y todavía sin alumnos, no se podía auditar hasta que
// llegara el primer estudiante y entregara algo. Justo al revés de lo que hace
// falta — la revisión sirve ANTES de que entre nadie.
//
// Esta función lee la estructura, no las notas. Funciona con el aula vacía.
//
// Sobre las ponderaciones: NO viven en un solo campo. Con agregación de media
// ponderada están en `aggregationcoef`; con agregación natural, en
// `aggregationcoef2` y expresadas como fracción (0.0833 = 8.33%). Se devuelven
// los dos, más el método de agregación de cada categoría, y que decida quien
// lee. Devolver solo uno funciona en unas familias y da números absurdos en
// otras.
// ---------------------------------------------------------------------------

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/externallib.php');

class local_bgugrades_external extends external_api {

    /** Tope por llamada. Sin él, un `courseids: []` en un campus grande
     *  devuelve una respuesta que nadie puede procesar ni depurar. */
    const MAX_AULAS = 400;

    public static function get_grade_structure_parameters() {
        return new external_function_parameters([
            'courseids' => new external_multiple_structure(
                new external_value(PARAM_INT, 'id del aula'),
                'Aulas a leer. Vacío = todas las aulas del sitio (hasta ' . self::MAX_AULAS . ').',
                VALUE_DEFAULT, []
            ),
        ]);
    }

    public static function get_grade_structure($courseids = []) {
        global $DB;

        $params = self::validate_parameters(
            self::get_grade_structure_parameters(), ['courseids' => $courseids]);
        $courseids = array_values(array_unique(array_filter($params['courseids'])));

        if (empty($courseids)) {
            // Barrido de todo el campus: se exige la capacidad a nivel de sitio.
            // Comprobarla aula por aula para cientos de aulas es lento y, sobre
            // todo, permitiría un barrido parcial silencioso —devolver la mitad
            // sin decir que faltó la otra mitad—.
            $context = context_system::instance();
            self::validate_context($context);
            require_capability('moodle/grade:viewall', $context);

            $courseids = $DB->get_fieldset_select(
                'course', 'id', 'id <> :site', ['site' => SITEID]);
            $courseids = array_slice($courseids, 0, self::MAX_AULAS);
        } else {
            if (count($courseids) > self::MAX_AULAS) {
                throw new invalid_parameter_exception(
                    'Máximo ' . self::MAX_AULAS . ' aulas por llamada; se pidieron ' . count($courseids));
            }
            foreach ($courseids as $cid) {
                $context = context_course::instance($cid, IGNORE_MISSING);
                if (!$context) {
                    throw new invalid_parameter_exception('El aula ' . $cid . ' no existe');
                }
                self::validate_context($context);
                require_capability('moodle/grade:viewall', $context);
            }
        }

        if (empty($courseids)) {
            return ['aulas' => []];
        }

        list($insql, $inparams) = $DB->get_in_or_equal($courseids, SQL_PARAMS_NAMED, 'c');

        // Los ítems, con la visibilidad de su módulo. Un ítem cuyo recurso está
        // oculto no cuenta para la política, igual que en el informe: por eso
        // se trae `cm.visible` y no solo `gi.hidden`. Son dos cosas distintas
        // —un ítem visible puede colgar de un recurso oculto— y mirar solo una
        // fue lo que dejó pasar el peso fantasma en su día.
        $sql = "SELECT gi.id,
                       gi.courseid,
                       gi.categoryid,
                       gi.itemname,
                       gi.itemtype,
                       gi.itemmodule,
                       gi.iteminstance,
                       gi.gradetype,
                       gi.grademax,
                       gi.grademin,
                       gi.aggregationcoef,
                       gi.aggregationcoef2,
                       gi.weightoverride,
                       gi.hidden,
                       gi.sortorder,
                       cm.id AS cmid,
                       cm.visible AS cmvisible
                  FROM {grade_items} gi
             LEFT JOIN {modules} m ON m.name = gi.itemmodule
             LEFT JOIN {course_modules} cm
                    ON cm.course = gi.courseid AND cm.module = m.id AND cm.instance = gi.iteminstance
                 WHERE gi.courseid $insql
              ORDER BY gi.courseid, gi.sortorder";
        $items = $DB->get_records_sql($sql, $inparams);

        $cats = $DB->get_records_select('grade_categories', "courseid $insql", $inparams,
            'courseid, depth', 'id, courseid, parent, fullname, aggregation, depth');

        $aulas = [];
        foreach ($courseids as $cid) {
            $aulas[$cid] = [
                'courseid'          => (int)$cid,
                'aggregation_raiz'  => null,
                'categoria_raiz'    => null,
                'escala_total'      => null,
                'suma_coeficientes' => null,
                'items'             => [],
                'categorias'        => [],
            ];
        }

        foreach ($cats as $cat) {
            if (!isset($aulas[$cat->courseid])) {
                continue;
            }
            $aulas[$cat->courseid]['categorias'][] = [
                'id'          => (int)$cat->id,
                'parent'      => $cat->parent === null ? 0 : (int)$cat->parent,
                'fullname'    => (string)$cat->fullname,
                'aggregation' => (int)$cat->aggregation,
                'depth'       => (int)$cat->depth,
            ];
            // La categoría raíz es la que no tiene madre: su método de
            // agregación es el que decide cómo se leen los coeficientes.
            if (empty($cat->parent)) {
                $aulas[$cat->courseid]['aggregation_raiz'] = (int)$cat->aggregation;
                $aulas[$cat->courseid]['categoria_raiz'] = (int)$cat->id;
            }
        }

        foreach ($items as $it) {
            if (!isset($aulas[$it->courseid])) {
                continue;
            }
            // Activo = ni el ítem oculto, ni su recurso oculto. Los ítems sin
            // módulo (categorías, manuales) no tienen visibilidad propia y se
            // consideran activos.
            $activo = empty($it->hidden) && ($it->cmid === null || !empty($it->cmvisible));

            if ($it->itemtype === 'course') {
                $aulas[$it->courseid]['escala_total'] =
                    $it->grademax === null ? null : (float)$it->grademax;
            }

            $aulas[$it->courseid]['items'][] = [
                'id'               => (int)$it->id,
                'nombre'           => $it->itemname === null ? '' : (string)$it->itemname,
                'itemtype'         => (string)$it->itemtype,
                'itemmodule'       => $it->itemmodule === null ? '' : (string)$it->itemmodule,
                'categoryid'       => $it->categoryid === null ? 0 : (int)$it->categoryid,
                'gradetype'        => (int)$it->gradetype,
                'grademax'         => $it->grademax === null ? null : (float)$it->grademax,
                'grademin'         => $it->grademin === null ? null : (float)$it->grademin,
                'aggregationcoef'  => (float)$it->aggregationcoef,
                'aggregationcoef2' => (float)$it->aggregationcoef2,
                'weightoverride'   => !empty($it->weightoverride),
                'oculto'           => !empty($it->hidden),
                'modulo_visible'   => $it->cmid === null ? null : !empty($it->cmvisible),
                'activo'           => $activo,
                'sortorder'        => (int)$it->sortorder,
            ];
        }

        // Conveniencia para la migración: la MISMA suma que hoy calcula el
        // proceso externo —SUM(aggregationcoef) de los ítems de módulo
        // activos—, para poder comparar los dos caminos antes de apagar el
        // viejo. No sustituye al detalle: quien audita debe mirar los ítems,
        // porque "la suma no da 100" no dice cuál falta.
        foreach ($aulas as $cid => $aula) {
            $suma = 0.0;
            $hay = false;
            foreach ($aula['items'] as $item) {
                if ($item['itemtype'] === 'mod' && $item['activo']) {
                    $suma += $item['aggregationcoef'];
                    $hay = true;
                }
            }
            $aulas[$cid]['suma_coeficientes'] = $hay ? round($suma, 5) : null;
        }

        return ['aulas' => array_values($aulas)];
    }

    public static function get_grade_structure_returns() {
        return new external_single_structure([
            'aulas' => new external_multiple_structure(
                new external_single_structure([
                    'courseid'          => new external_value(PARAM_INT, 'id del aula'),
                    'aggregation_raiz'  => new external_value(PARAM_INT, 'método de agregación de la categoría raíz (0=media, 10=media ponderada, 13=natural, …)', VALUE_OPTIONAL),
                    'categoria_raiz'    => new external_value(PARAM_INT, 'id de la categoría raíz', VALUE_OPTIONAL),
                    'escala_total'      => new external_value(PARAM_FLOAT, 'grademax del total del curso', VALUE_OPTIONAL),
                    'suma_coeficientes' => new external_value(PARAM_FLOAT, 'suma de aggregationcoef de los ítems de módulo activos', VALUE_OPTIONAL),
                    'categorias' => new external_multiple_structure(
                        new external_single_structure([
                            'id'          => new external_value(PARAM_INT, 'id'),
                            'parent'      => new external_value(PARAM_INT, 'categoría madre (0 = raíz)'),
                            'fullname'    => new external_value(PARAM_RAW, 'nombre'),
                            'aggregation' => new external_value(PARAM_INT, 'método de agregación'),
                            'depth'       => new external_value(PARAM_INT, 'profundidad'),
                        ])
                    ),
                    'items' => new external_multiple_structure(
                        new external_single_structure([
                            'id'               => new external_value(PARAM_INT, 'id del ítem'),
                            'nombre'           => new external_value(PARAM_RAW, 'nombre del ítem'),
                            'itemtype'         => new external_value(PARAM_ALPHANUMEXT, 'course | category | mod | manual'),
                            'itemmodule'       => new external_value(PARAM_ALPHANUMEXT, 'quiz, assign, …'),
                            'categoryid'       => new external_value(PARAM_INT, 'categoría a la que cuelga'),
                            'gradetype'        => new external_value(PARAM_INT, '0=none 1=valor 2=escala 3=texto'),
                            'grademax'         => new external_value(PARAM_FLOAT, 'nota máxima', VALUE_OPTIONAL),
                            'grademin'         => new external_value(PARAM_FLOAT, 'nota mínima', VALUE_OPTIONAL),
                            'aggregationcoef'  => new external_value(PARAM_FLOAT, 'peso en media ponderada'),
                            'aggregationcoef2' => new external_value(PARAM_FLOAT, 'peso en agregación natural (fracción)'),
                            'weightoverride'   => new external_value(PARAM_BOOL, 'el peso se fijó a mano'),
                            'oculto'           => new external_value(PARAM_BOOL, 'el ítem está oculto'),
                            'modulo_visible'   => new external_value(PARAM_BOOL, 'el recurso está visible (null si no es un módulo)', VALUE_OPTIONAL),
                            'activo'           => new external_value(PARAM_BOOL, 'cuenta para la política: ni el ítem ni su recurso están ocultos'),
                            'sortorder'        => new external_value(PARAM_INT, 'orden'),
                        ])
                    ),
                ])
            ),
        ]);
    }
}

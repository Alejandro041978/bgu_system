<?php
// Lee la ESTRUCTURA del libro de calificaciones de un aula: qué ítems tiene,
// cuánto pesa cada uno y con qué método se agregan. Sin pasar por ningún
// estudiante, para que un aula recién construida y todavía vacía se pueda
// auditar el día que se termina.

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'local_bgugrades';
$plugin->version   = 2026091600;
$plugin->requires  = 2023042400;   // Moodle 4.2 (API externo en core_external)
$plugin->supported = [402, 405];   // probado en 4.5 (campus, 16/09/2026)
$plugin->maturity  = MATURITY_STABLE;
$plugin->release   = '1.1.0';

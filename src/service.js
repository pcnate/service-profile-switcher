const exec = require( 'child_process' ).exec;
const args = require( 'minimist' )( process.argv.slice( 2 ) )
const isElevated = require('is-elevated');

const programs = {}
const services = {}

programs.studio5000 = [];
services.studio5000 = [
  'FTActivationBoost',
  'FactoryTalk Activation Service',
  'RNADiagnosticsService',
  'RSLinxNG',
  'RSLinxNG02',
  'FTLinxSecurityServer',
  'UpdaterAgent',
  'FTAECommandServer',
  'FTAE_HistServ',
  'FTAEHistorianDataProvider',
  'FTAE_Archiver',
  'RnaAlarmMux',
  'RnaAeServer',
  'RsvcHost',
  'RNADirMultiplexor',
  'RNADirectory',
  'EventClientMultiplexer',
  'EventServer',
  'NmspHost',
  'RdcyHost',
  'BoxLogixDatabaseEditor',
  'BoxLogixServerMonitor',
  'BoxLogixServerMonitor2',
  'MSSQLSERVER',
  'MSSQL$SQLACM',
  'SQLSERVERAGENT',
  'SQLBrowser',
  'SQLWriter',
  'SQLTELEMETRY',
];

programs.developer = [];
services.developer = [
  // 'BoxLogixDatabaseEditor',
  'BoxLogixLogixSuiteEventServer',
  'BoxLogixServerMonitor',
  'BoxLogixServerMonitor2',
  'MSSQLSERVER',
  'MSSQL$SQLACM',
  'SQLSERVERAGENT',
  'SQLBrowser',
  'SQLWriter',
  'SQLTELEMETRY',
];

programs.work = [];
services.work = [];

programs.gaming = [];
services.gaming = [];

programs.meeting = [];
services.meeting = [];

function netProcess( action, service ) {
  return new Promise( resolve => {
    exec( `net ${ action } ${ service }`, ( error, stdout, stderr ) => { resolve([ error, stdout, stderr ]) } )
  })
}

(async () => {

  if( !args || args.profile === void 0 ) {
    console.error( 'no profile selected' );
    process.exit( 1 );
  }


  if( !await isElevated() ) {
    console.error( 'process is not root' );
    process.exit( 1 );
  };

  if ( Object.keys( programs ).indexOf( args.profile ) === -1 || Object.keys( services ).indexOf( args.profile ) === -1 ) {
    console.error( `${ args.profile } profile does not exist` );
    process.exit( 1 );
  }

  let servicesToStop = []
  let programsToStop = []
  let servicesToStart = []
  let programsToStart = []

  let noneActiveProfiles = Object.keys( services ).filter( x => x !== args.profile )

  servicesToStart = services[ args.profile ]
  programsToStart = programs[ args.profile ]

  for( const x in noneActiveProfiles ) {
    if( Object.hasOwnProperty.call( noneActiveProfiles, x ) ) {
      servicesToStop = [ ...servicesToStop, ...services[ noneActiveProfiles[x] ] ]
      programsToStop = [ ...programsToStop, ...programs[ noneActiveProfiles[x] ] ]
    }
  }
  
  servicesToStop = servicesToStop.filter( x => servicesToStart.indexOf( x ) === -1 )

  let results = { programs: { stop: [], start: [] }, services: { stop: [], start: [] } };

  for( const x of servicesToStop ) {
    console.log( `stopping ${ x }` )
    let [ error, stdout, stderr ] = await netProcess( 'stop', x )
    results.services.stop.push({ service: x, error, stdout, stderr })
  }

  for( const x of servicesToStart ) {
    console.log( `starting ${ x }` )
    let [ error, stdout, stderr ] = await netProcess( 'start', x )
    results.services.stop.push({ service: x, error, stdout, stderr })
  }

})();

const exec = require( 'child_process' ).exec;
const isElevated = require( 'is-elevated' );
const blessed = require( 'blessed' );
const minimist = require( 'minimist' );

const args = minimist( process.argv.slice( 2 ), {
  string: [ 'profile' ],
  alias: { p: 'profile', h: 'help' },
  boolean: [ 'help' ],
});

const profiles = {
  studio5000: {
    name: 'Studio 5000',
    hotkey: '1',
    programs: [],
    services: [
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
    ],
  },
  developer: {
    name: 'Developer',
    hotkey: '2',
    programs: [],
    services: [
      'BoxLogixDatabaseEditor',
      'MSSQLSERVER',
      'MSSQL$SQLACM',
      'SQLSERVERAGENT',
      'SQLBrowser',
      'SQLWriter',
      'SQLTELEMETRY',
    ],
  },
  work: {
    name: 'Work',
    hotkey: '3',
    programs: [],
    services: [],
  },
  gaming: {
    name: 'Gaming',
    hotkey: '4',
    programs: [],
    services: [],
  },
  meeting: {
    name: 'Meeting',
    hotkey: '5',
    programs: [],
    services: [],
  },
};

let screen, profileBox, serviceBox, statusBar, commandInput;
let commandMode = false;
let profileSelectMode = false;
let activeProfileKey = null;
let serviceStatuses = {};
let serviceExists = {};
let showNonExistent = true;
let togglingService = null; // service currently being started/stopped
let sortedServiceList = [];
let selectedServiceIndex = 0;
let selectedProfileIndex = 0;
let focusedPanel = 'services'; // 'services' or 'profiles'


/**
 * Executes a net command to start or stop a Windows service.
 *
 * @param action - The action to perform ('start' or 'stop')
 * @param service - The name of the service
 * @returns Promise resolving to [error, stdout, stderr]
 */
function netProcess( action, service ) {
  return new Promise( resolve => {
    exec( `net ${ action } "${ service }"`, ( error, stdout, stderr ) => {
      resolve([ error, stdout, stderr ]);
    });
  });
}


/**
 * Checks if a Windows service exists and is currently running.
 *
 * @param service - The name of the service to check
 * @returns Promise resolving to { exists, running }
 */
function checkServiceStatus( service ) {
  return new Promise( resolve => {
    exec( `sc query "${ service }"`, ( error, stdout ) => {
      if ( error ) {
        // Service doesn't exist or can't be queried
        resolve({ exists: false, running: false });
        return;
      }
      const exists = !stdout.includes( 'does not exist' ) && !stdout.includes( 'FAILED 1060' );
      const running = stdout.includes( 'RUNNING' );
      resolve({ exists, running });
    });
  });
}


/**
 * Gets all unique services across all profiles.
 *
 * @returns Array of unique service names
 */
function getAllServices() {
  const allServices = new Set();
  for ( const profile of Object.values( profiles ) ) {
    for ( const service of profile.services ) {
      allServices.add( service );
    }
  }
  return [ ...allServices ];
}


/**
 * Updates the status of all services.
 */
async function refreshServiceStatuses() {
  const allServices = getAllServices();
  const promises = allServices.map( async service => {
    const { exists, running } = await checkServiceStatus( service );
    serviceExists[ service ] = exists;
    serviceStatuses[ service ] = running;
  });
  await Promise.all( promises );
  renderServiceList();
}


/**
 * Renders the profile list box.
 */
function renderProfileList() {
  const profileKeys = Object.keys( profiles );

  // Clamp selection index
  if ( selectedProfileIndex >= profileKeys.length ) {
    selectedProfileIndex = Math.max( 0, profileKeys.length - 1 );
  }

  // Calculate available width (30% of screen minus borders)
  const boxWidth = profileBox.width - 2;
  const contentWidth = boxWidth - 2; // left marker + right marker

  const lines = profileKeys.map(( key, index ) => {
    const profile = profiles[ key ];
    const existingServices = profile.services.filter( s => serviceExists[ s ] !== false );
    const runningCount = existingServices.filter( s => serviceStatuses[ s ] ).length;
    const totalCount = existingServices.length;
    const anyServiceRunning = getAllServices().some( s => serviceExists[ s ] !== false && serviceStatuses[ s ] );
    const allRunning = totalCount > 0 ? runningCount === totalCount : !anyServiceRunning;
    const statusText = totalCount > 0 ? `[${ runningCount }/${ totalCount }]` : '[0]';
    const status = allRunning ? `{green-fg}${ statusText }{/green-fg}` : statusText;
    const isActive = key === activeProfileKey;
    const isSelected = index === selectedProfileIndex && focusedPanel === 'profiles';
    const activePrefix = isActive ? '{green-fg}{bold}' : '';
    const activeSuffix = isActive ? '{/bold}{/green-fg}' : '';
    const left = isSelected ? '>' : ' ';
    const right = isSelected ? '<' : ' ';
    const label = `[${ profile.hotkey }] ${ profile.name }`;
    const padding = contentWidth - label.length - statusText.length;
    const space = ' '.repeat( Math.max( 1, padding ) );
    return `${ left }${ activePrefix }${ label }${ space }${ activeSuffix }${ status }${ right }`;
  });

  profileBox.setContent( lines.join( '\n' ) );
  screen.render();
}


/**
 * Renders the service status list box.
 */
function renderServiceList() {
  const allServices = getAllServices().filter( s => showNonExistent || serviceExists[ s ] !== false );

  if ( allServices.length === 0 ) {
    sortedServiceList = [];
    serviceBox.setContent( '{center}No services found{/center}' );
    screen.render();
    return;
  }

  // Sort: existing services first, then alphabetically within each group
  sortedServiceList = [ ...allServices ].sort(( a, b ) => {
    const aExists = serviceExists[ a ] !== false ? 1 : 0;
    const bExists = serviceExists[ b ] !== false ? 1 : 0;

    if ( aExists !== bExists ) {
      return bExists - aExists; // Existing first
    }

    return a.localeCompare( b ); // Alphabetical within group
  });

  // Clamp selection index
  if ( selectedServiceIndex >= sortedServiceList.length ) {
    selectedServiceIndex = Math.max( 0, sortedServiceList.length - 1 );
  }

  // Calculate available width (70% of screen minus borders and scrollbar)
  const boxWidth = serviceBox.width - 3; // -2 for borders, -1 for scrollbar
  const contentWidth = boxWidth - 4; // left marker + icon + space + right marker

  const lines = sortedServiceList.map(( service, index ) => {
    const running = serviceStatuses[ service ];
    const exists = serviceExists[ service ] !== false;
    const isToggling = service === togglingService;
    let icon;
    if ( isToggling ) {
      icon = '{yellow-fg}◐{/yellow-fg}';
    } else if ( !exists ) {
      icon = '{red-fg}✗{/red-fg}';
    } else if ( running ) {
      icon = '{green-fg}●{/green-fg}';
    } else {
      icon = '{red-fg}○{/red-fg}';
    }
    const isSelected = index === selectedServiceIndex && focusedPanel === 'services';
    const left = isSelected ? '>' : ' ';
    const right = isSelected ? '<' : ' ';
    const name = service.substring( 0, contentWidth - 5 ); // leave room for 3 spaces + '- '
    const spaceCount = contentWidth - name.length;
    // Build pattern: 3 spaces then dashes from right ending with '- '
    const dashSpace = Math.max( 0, spaceCount - 3 );
    const fullPattern = ' -'.repeat( Math.ceil( dashSpace / 2 ) );
    const dashes = fullPattern.substring( fullPattern.length - dashSpace );
    const filler = '   ' + dashes;
    const fill = isSelected ? filler.substring( 0, spaceCount ) : ' '.repeat( spaceCount );
    return `${ left }${ icon } ${ name }${ fill }${ right }`;
  });

  serviceBox.setContent( lines.join( '\n' ) );
  screen.render();
}


/**
 * Updates the status bar with a message.
 *
 * @param message - The message to display
 */
function setStatus( message ) {
  statusBar.setContent( ` ${ message }` );
  screen.render();
}


/**
 * Switches to the selected profile.
 *
 * @param profileKey - The key of the profile to activate
 */
async function switchProfile( profileKey ) {
  const profile = profiles[ profileKey ];
  activeProfileKey = profileKey;

  setStatus( `Switching to ${ profile.name }...` );
  renderProfileList();

  let servicesToStop = [];
  const servicesToStart = profile.services;

  const otherProfileKeys = Object.keys( profiles ).filter( x => x !== profileKey );

  for ( const key of otherProfileKeys ) {
    servicesToStop = [ ...servicesToStop, ...profiles[ key ].services ];
  }

  servicesToStop = [ ...new Set( servicesToStop ) ].filter(
    x => !servicesToStart.includes( x )
  );

  // Stop services
  for ( const service of servicesToStop ) {
    if ( serviceStatuses[ service ] ) {
      togglingService = service;
      renderServiceList();
      setStatus( `Stopping ${ service }...` );
      await netProcess( 'stop', service );
      serviceStatuses[ service ] = false;
      togglingService = null;
      renderServiceList();
      renderProfileList();
    }
  }

  // Start services
  for ( const service of servicesToStart ) {
    if ( !serviceStatuses[ service ] ) {
      togglingService = service;
      renderServiceList();
      setStatus( `Starting ${ service }...` );
      await netProcess( 'start', service );
      serviceStatuses[ service ] = true;
      togglingService = null;
      renderServiceList();
      renderProfileList();
    }
  }

  setStatus( 'p: profile | /: command | r: refresh | q: quit' );
}


/**
 * Shows the command input for "/" commands.
 */
function showCommandInput() {
  commandMode = true;
  commandInput.show();
  commandInput.focus();
  commandInput.setValue( '' );
  screen.render();
}


/**
 * Hides the command input.
 */
function hideCommandInput() {
  commandMode = false;
  commandInput.hide();
  serviceBox.focus();
  screen.render();
}


/**
 * Handles command input submission.
 *
 * @param value - The command entered
 */
async function handleCommand( value ) {
  hideCommandInput();

  const cmd = value.trim().toLowerCase();

  if ( cmd === 'quit' || cmd === 'q' || cmd === 'exit' || cmd.startsWith( 'quit ' ) || cmd.startsWith( 'q ' ) || cmd.startsWith( 'exit ' ) ) {
    const parts = cmd.split( /\s+/ );
    if ( parts.length > 1 ) {
      const profileName = parts.slice( 1 ).join( ' ' );
      const profileKey = Object.keys( profiles ).find(
        key => key.toLowerCase() === profileName || profiles[ key ].name.toLowerCase() === profileName
      );

      if ( profileKey ) {
        await switchProfile( profileKey );
      } else {
        setStatus( `Unknown profile: ${ profileName }` );
        return;
      }
    }
    process.exit( 0 );
  }

  if ( cmd === 'refresh' || cmd === 'r' ) {
    setStatus( 'Refreshing service statuses...' );
    await refreshServiceStatuses();
    renderProfileList();
    setStatus( 'Refreshed | p: profile | /: command | q: quit' );
    return;
  }

  if ( cmd.startsWith( 'load ' ) || cmd.startsWith( 'l ' ) || cmd.startsWith( 'p ' ) ) {
    const profileName = cmd.replace( /^(load|l|p)\s+/, '' );
    const profileKey = Object.keys( profiles ).find(
      key => key.toLowerCase() === profileName ||
             profiles[ key ].name.toLowerCase() === profileName ||
             profiles[ key ].hotkey === profileName
    );

    if ( profileKey ) {
      await switchProfile( profileKey );
    } else {
      setStatus( `Unknown profile: ${ profileName }` );
    }
    return;
  }

  if ( cmd === 'help' || cmd === 'h' || cmd === '?' ) {
    setStatus( 'Commands: p <name|#>, refresh, quit [profile]' );
    return;
  }

  // Try to match as profile name directly
  const profileKey = Object.keys( profiles ).find(
    key => key.toLowerCase() === cmd || profiles[ key ].name.toLowerCase() === cmd
  );

  if ( profileKey ) {
    await switchProfile( profileKey );
    return;
  }

  setStatus( `Unknown command: ${ cmd } | /help for commands` );
}


/**
 * Creates and initializes the TUI.
 */
function createTUI() {
  screen = blessed.screen({
    smartCSR: true,
    mouse: true,
    title: 'Service Profile Switcher',
  });

  // Header
  blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: '{center}{bold}Service Profile Switcher{/bold}{/center}',
    tags: true,
    style: {
      fg: 'white',
      bg: 'blue',
    },
  });

  // Profile list box
  profileBox = blessed.box({
    parent: screen,
    label: ' Profiles ',
    top: 1,
    left: 0,
    width: '30%',
    height: '100%-2',
    border: { type: 'line' },
    tags: true,
    scrollable: true,
    keys: false,
    vi: false,
    mouse: false,
    style: {
      border: { fg: 'cyan' },
      focus: { border: { fg: 'yellow' } },
    },
  });

  // Service status box
  serviceBox = blessed.box({
    parent: screen,
    label: ' Services ',
    top: 1,
    left: '30%',
    right: 0,
    height: '100%-2',
    border: { type: 'line' },
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    keys: false,
    vi: false,
    mouse: false,
    scrollbar: {
      style: { bg: 'cyan' },
    },
    style: {
      border: { fg: 'cyan' },
      focus: { border: { fg: 'yellow' } },
    },
  });

  // Status bar
  statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' Loading service statuses...',
    tags: true,
    style: {
      fg: 'white',
      bg: 'gray',
    },
  });

  // Command input
  commandInput = blessed.textbox({
    parent: screen,
    label: ' Command (type "help" for commands) ',
    bottom: 1,
    left: 'center',
    width: '60%',
    height: 3,
    border: { type: 'line' },
    hidden: true,
    inputOnFocus: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'yellow' },
    },
  });

  // Key bindings
  screen.key([ 'q', 'C-c' ], () => {
    if ( !commandMode ) {
      process.exit( 0 );
    }
  });

  screen.key( '/', () => {
    if ( !commandMode ) {
      showCommandInput();
    }
  });


  screen.key( 'r', async () => {
    if ( !commandMode && !profileSelectMode ) {
      setStatus( 'Refreshing service statuses...' );
      await refreshServiceStatuses();
      renderProfileList();
      setStatus( 'p: profile | /: command | r: refresh | q: quit' );
    }
  });

  screen.key( 'h', () => {
    if ( !commandMode && !profileSelectMode ) {
      showNonExistent = !showNonExistent;
      renderServiceList();
      setStatus( showNonExistent ? 'Showing all services | h: hide missing' : 'Hiding missing services | h: show all' );
    }
  });

  // Profile select mode
  screen.key( 'p', () => {
    if ( !commandMode && !profileSelectMode ) {
      profileSelectMode = true;
      setStatus( 'Select profile: 1-5 | Esc: cancel' );
    }
  });

  screen.key( 'escape', () => {
    if ( commandMode ) {
      hideCommandInput();
    } else if ( profileSelectMode ) {
      profileSelectMode = false;
      setStatus( 'p: profile | /: command | r: refresh | q: quit' );
    }
  });

  // Profile hotkeys (only active in profile select mode)
  for ( const [ key, profile ] of Object.entries( profiles ) ) {
    screen.key( profile.hotkey, async () => {
      if ( profileSelectMode ) {
        profileSelectMode = false;
        await switchProfile( key );
      }
    });
  }

  // Command input handlers
  commandInput.on( 'submit', handleCommand );
  commandInput.on( 'cancel', hideCommandInput );

  // Tab to switch between panels
  screen.key( 'tab', () => {
    if ( commandMode || profileSelectMode ) return;
    focusedPanel = focusedPanel === 'services' ? 'profiles' : 'services';
    renderServiceList();
    renderProfileList();
  });

  // Scroll list to keep selection visible with 5 row margin
  function scrollList( box, selectedIndex, listLength ) {
    const visibleHeight = box.height - 2; // subtract borders
    const scrollOffset = box.childBase || 0;
    const margin = 5;

    // Scroll down if selection is near bottom
    if ( selectedIndex >= scrollOffset + visibleHeight - margin ) {
      const newScroll = Math.min(
        listLength - visibleHeight,
        selectedIndex - visibleHeight + margin + 1
      );
      box.scrollTo( Math.max( 0, newScroll ) );
    }

    // Scroll up if selection is near top
    if ( selectedIndex < scrollOffset + margin ) {
      const newScroll = Math.max( 0, selectedIndex - margin );
      box.scrollTo( newScroll );
    }
  }

  // Arrow keys to navigate
  screen.key([ 'up', 'k' ], () => {
    if ( commandMode || profileSelectMode ) return;
    if ( focusedPanel === 'services' ) {
      selectedServiceIndex = Math.max( 0, selectedServiceIndex - 1 );
      scrollList( serviceBox, selectedServiceIndex, sortedServiceList.length );
      renderServiceList();
    } else {
      selectedProfileIndex = Math.max( 0, selectedProfileIndex - 1 );
      scrollList( profileBox, selectedProfileIndex, Object.keys( profiles ).length );
      renderProfileList();
    }
  });

  screen.key([ 'down', 'j' ], () => {
    if ( commandMode || profileSelectMode ) return;
    if ( focusedPanel === 'services' ) {
      selectedServiceIndex = Math.min( sortedServiceList.length - 1, selectedServiceIndex + 1 );
      scrollList( serviceBox, selectedServiceIndex, sortedServiceList.length );
      renderServiceList();
    } else {
      const profileKeys = Object.keys( profiles );
      selectedProfileIndex = Math.min( profileKeys.length - 1, selectedProfileIndex + 1 );
      scrollList( profileBox, selectedProfileIndex, profileKeys.length );
      renderProfileList();
    }
  });

  // Home to go to top
  screen.key( 'home', () => {
    if ( commandMode || profileSelectMode ) return;
    if ( focusedPanel === 'services' ) {
      selectedServiceIndex = 0;
      serviceBox.scrollTo( 0 );
      renderServiceList();
    } else {
      selectedProfileIndex = 0;
      profileBox.scrollTo( 0 );
      renderProfileList();
    }
  });

  // End to go to bottom
  screen.key( 'end', () => {
    if ( commandMode || profileSelectMode ) return;
    if ( focusedPanel === 'services' ) {
      selectedServiceIndex = sortedServiceList.length - 1;
      scrollList( serviceBox, selectedServiceIndex, sortedServiceList.length );
      renderServiceList();
    } else {
      const profileKeys = Object.keys( profiles );
      selectedProfileIndex = profileKeys.length - 1;
      scrollList( profileBox, selectedProfileIndex, profileKeys.length );
      renderProfileList();
    }
  });

  // Page Up
  screen.key( 'pageup', () => {
    if ( commandMode || profileSelectMode ) return;
    if ( focusedPanel === 'services' ) {
      const pageSize = serviceBox.height - 2;
      selectedServiceIndex = Math.max( 0, selectedServiceIndex - pageSize );
      scrollList( serviceBox, selectedServiceIndex, sortedServiceList.length );
      renderServiceList();
    } else {
      const pageSize = profileBox.height - 2;
      selectedProfileIndex = Math.max( 0, selectedProfileIndex - pageSize );
      scrollList( profileBox, selectedProfileIndex, Object.keys( profiles ).length );
      renderProfileList();
    }
  });

  // Page Down
  screen.key( 'pagedown', () => {
    if ( commandMode || profileSelectMode ) return;
    if ( focusedPanel === 'services' ) {
      const pageSize = serviceBox.height - 2;
      selectedServiceIndex = Math.min( sortedServiceList.length - 1, selectedServiceIndex + pageSize );
      scrollList( serviceBox, selectedServiceIndex, sortedServiceList.length );
      renderServiceList();
    } else {
      const profileKeys = Object.keys( profiles );
      const pageSize = profileBox.height - 2;
      selectedProfileIndex = Math.min( profileKeys.length - 1, selectedProfileIndex + pageSize );
      scrollList( profileBox, selectedProfileIndex, profileKeys.length );
      renderProfileList();
    }
  });

  // Enter to toggle service or activate profile
  screen.key( 'enter', async () => {
    if ( commandMode || profileSelectMode ) return;

    if ( focusedPanel === 'services' ) {
      if ( sortedServiceList.length === 0 ) return;

      const service = sortedServiceList[ selectedServiceIndex ];
      const running = serviceStatuses[ service ];

      togglingService = service;
      renderServiceList();
      setStatus( `${ running ? 'Stopping' : 'Starting' } ${ service }...` );
      await netProcess( running ? 'stop' : 'start', service );
      serviceStatuses[ service ] = !running;
      togglingService = null;
      renderServiceList();
      renderProfileList();
      setStatus( 'p: profile | /: command | r: refresh | q: quit' );
    } else {
      const profileKeys = Object.keys( profiles );
      if ( profileKeys.length === 0 ) return;
      const profileKey = profileKeys[ selectedProfileIndex ];
      await switchProfile( profileKey );
    }
  });

  serviceBox.focus();
}


/**
 * Prints usage information.
 */
function printUsage() {
  console.log( 'Usage: node service.js [options]' );
  console.log();
  console.log( 'Options:' );
  console.log( '  --profile, -p <name>  Switch to the specified profile' );
  console.log( '  --help, -h            Show this help message' );
  console.log();
  console.log( 'Available profiles:' );
  for ( const [ key, profile ] of Object.entries( profiles ) ) {
    console.log( `  ${ key.padEnd( 15 ) } - ${ profile.name } (${ profile.services.length } services)` );
  }
  console.log();
  console.log( 'TUI Hotkeys:' );
  console.log( '  Tab       Switch between services/profiles' );
  console.log( '  ↑/↓, j/k  Navigate list' );
  console.log( '  Enter     Toggle service or activate profile' );
  console.log( '  p         Enter profile select mode (then 1-5)' );
  console.log( '  /         Open command input' );
  console.log( '  r         Refresh service statuses' );
  console.log( '  Esc       Cancel current mode' );
  console.log( '  q         Quit' );
  console.log();
  console.log( 'Commands (press / to open):' );
  console.log( '  p <name|number>     Load a profile (e.g., "p 1" or "p developer")' );
  console.log( '  refresh             Refresh service statuses' );
  console.log( '  quit [profile]      Exit (optionally apply profile first)' );
  console.log();
  console.log( 'Run without arguments for interactive mode.' );
}


/**
 * Main entry point.
 */
async function main() {
  // Check for help flag first
  if ( args.help ) {
    printUsage();
    process.exit( 0 );
  }

  // Check for elevated permissions
  if ( !await isElevated() ) {
    console.error( 'Error: This application requires administrator privileges.' );
    console.error( 'Please run as Administrator.' );
    process.exit( 1 );
  }

  // Validate --profile argument if provided
  let initialProfile = null;
  if ( args.profile ) {
    if ( !profiles[ args.profile ] ) {
      console.error( `Error: Unknown profile "${ args.profile }"` );
      console.log();
      printUsage();
      process.exit( 1 );
    }
    initialProfile = args.profile;
  }

  // Interactive TUI mode
  createTUI();
  renderProfileList();
  renderServiceList();

  setStatus( 'Loading service statuses...' );
  await refreshServiceStatuses();
  renderProfileList();

  // Load initial profile if specified
  if ( initialProfile ) {
    await switchProfile( initialProfile );
  } else {
    setStatus( 'p: profile | /: command | r: refresh | q: quit' );
  }

  // Auto-refresh service statuses every 30 seconds
  setInterval( async () => {
    if ( !commandMode && !profileSelectMode && !togglingService ) {
      await refreshServiceStatuses();
      renderProfileList();
    }
  }, 30000 );
}

main().catch( err => {
  console.error( 'Fatal error:', err.message );
  process.exit( 1 );
});

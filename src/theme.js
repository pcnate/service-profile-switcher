const { exec } = require( 'child_process' );
const args = require( 'minimist' )( process.argv.slice( 2 ) )


/**
 * run a powershell script
 * 
 * @param {string} script powershell script
 * @returns 
 */
async function runscript( script ) {
  return new Promise( async resolve => {
    exec( script, { shell: 'powershell.exe' }, ( error, stdout, stderr ) => {
      if ( error ) {
        console.warn( error );
      }
      resolve( stdout ? stdout : stderr );
    } );
  } );
}

async function runCommand( command, args ) {
  return new Promise( async resolve => {
    exec( )
    resolve();
  });
}


async function changeWindowsTheme( themeName ) {
  let script = `$theme = "${ process.env.localappdata }\\Microsoft\\Windows\\Themes\\${ themeName }.theme"
  Invoke-Expression "& '$theme'"`;

  await runscript( script );
}


/**
 * instruct rainmeter to change layouts
 * 
 * @param {string} layout layout within rainmeter
 */
async function changeRainMeterLayout( layout ) {

  let script = `cd "C:\\Program Files\\Rainmeter\\";./RainMeter.exe !LoadLayout "${ layout }"`;

  await runscript( script );

}


/**
 * main function
 */
async function main() {
  if ( !args || args.profile === void 0 ) {
    console.error( 'no profile selected' );
    process.exit( 1 );
  }

  if ( args.profile === 'work' ) {
    await changeWindowsTheme( 'Nate Work' );
    await changeRainMeterLayout( 'work' );
  } else
  if ( args.profile === 'home' ) {
    await changeWindowsTheme( 'Nate Home' );
    await changeRainMeterLayout( 'home' );
  } else
  if ( args.profile === 'laptop' ) {
    await changeWindowsTheme( 'Nate Laptop' );
    await changeRainMeterLayout( 'laptop' );
  }

}


if ( !!require.main ) {
  main();
} else {
  module.exports = {

  }
}
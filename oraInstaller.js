/*
** oraInstaller - Install oracle kits in a certain format in a DevOps environment.
**                The kit format is depending on a DBAAS Toolkit that creates schemas in a standard way, so most if not all
**                schema, roles, creation ddl is needed in this kit, just the plain DDL to create tables, indexes, sequences, etc.
*/

ctx.write('Begin script\n');
var oraInstaller = {};
var Properties = Java.type("java.util.Properties");
oraInstaller.properties = new Properties();
var OracleConnection = Java.type("oracle.jdbc.OracleConnection");
var DBUtil  = Java.type("oracle.dbtools.db.DBUtil");
oraInstaller.ScriptExecutor  = Java.type("oracle.dbtools.raptor.newscriptrunner.ScriptExecutor");

oraInstaller.properties = new Properties();
oraInstaller.DriverManager = Java.type("java.sql.DriverManager");
ctx.write('Begin init\n');
oraInstaller.install = null;   // Dit is de versie in de database die is leeg bij een fresh install en de versie bevat
oraInstaller.owner = '';
oraInstaller.versie = '';
oraInstaller.kitversie = '';
oraInstaller.syscon = conn;
oraInstaller.sysutil = util;
oraInstaller.installuser = 'dbaas';   // Probably should do a select user from dual, to find our current user
oraInstaller.installpwd = args[1];  // Komt als parameter mee
oraInstaller.appl       = args[2].toUpperCase();  // 
oraInstaller.appl_home  = args[3];  // 
oraInstaller.scriptfile = oraInstaller.appl_home + '/install/' + oraInstaller.appl + '_install';
oraInstaller.lees       = oraInstaller.appl + '_LEES';
oraInstaller.adm        = oraInstaller.appl + '_ADM';
oraInstaller.mut        = oraInstaller.appl + '_MUT';
oraInstaller.update_prefix = oraInstaller.appl + '_update';
oraInstaller.install_dir = oraInstaller.appl_home + '/install'; 
oraInstaller.scriptexecown = null;
oraInstaller.fullowner = null;
oraInstaller.toetsomgeving = null;

oraInstaller.replacevars=function(line)
{
   var res;
   ctx.write('BEFORE: ' + line + '\n');
   res = line.replace('${APPL_HOME}', oraInstaller.appl_home);
   res = res.replace('$APPL_HOME', oraInstaller.appl_home);
   res = res.replace('${owner}', oraInstaller.owner);
   res = res.replace('$owner', oraInstaller.owner);
   res = res.replace('$fullowner', oraInstaller.fullowner);
   res = res.replace('$omgeving', oraInstaller.omgeving);
   res = res.replace('$toetsomgeving', oraInstaller.toetsomgeving);
   res = res.replace('${SQL}', oraInstaller.appl_home + '/db');
   res = res.substr(0, res.length - 1);
   res = res.substr(1, res.length);
   
   ctx.write('AFTER : ' + res + '\n');
   return res;
}

oraInstaller.bepaalomgeving=function(username)
{
   var binds   = { }; 
	   binds.username = username;
	   binds.aq       = '%AQ%\_OWN';
	   binds.regex    = '^'+username+'._OWN';
	   	   
   var sql     = 'select substr(username, length(upper(:username))+1, 1) from all_users where regexp_like(username, :regex) and username not like :aq';
   var omgeving = oraInstaller.sysutil.executeReturnOneCol(sql, binds);
   ctx.write('Omgeving voor ' + username + ': ' + omgeving + '\n');
   return omgeving;
}

oraInstaller.bepaalowner=function(appl)
{
   var binds   = { }; 
	   binds.username = appl + '%';
	   binds.aq       = '%_AQOWN';
		
   var sql    = 'select username from all_users where username like upper(:username) and  username not like :aq';
   var owner  = oraInstaller.sysutil.executeReturnOneCol(sql, binds);
   ctx.write('Owner voor ' + appl + ': ' + owner + '\n');
   return owner;
}

oraInstaller.checkversion=function(appl)
{
	var binds     = {}; 
	    binds.Kit = 'Database Kit';
    var version   = 'Niet gezet'; 
	var sql       = 'select ' + appl + '_versie from ' + appl + '_versie where ' + appl + '_onderdeel = :Kit';
 
    try {
	   version = oraInstaller.ownutil.executeReturnOneCol(sql, binds);
	} 
	catch (e)
	{
	   ctx.write('error: ' + e + '\n');
	}
    ctx.write('Versie voor ' + appl + ': ' + version + '\n');
	return version;
}

oraInstaller.set_proxy=function(dbaas, owner, lees, adm, mut)
{
    var ret;
	ret = oraInstaller.sysutil.execute('alter user ' + owner + ' account unlock');
    ret = oraInstaller.sysutil.execute('alter user ' + owner + ' grant connect through ' + dbaas);
    ret = oraInstaller.sysutil.execute('alter user ' + mut + ' grant connect through ' + dbaas);
    ret = oraInstaller.sysutil.execute('alter user ' + lees + ' grant connect through ' + dbaas);
    ret = oraInstaller.sysutil.execute('grant create any synonym to ' + owner); 
    ret = oraInstaller.sysutil.execute('grant drop any synonym to ' + owner); 
    ret = oraInstaller.sysutil.execute('grant create public synonym to ' + owner); 
    ret = oraInstaller.sysutil.execute('grant resumable to ' + owner);
}

oraInstaller.check_object=function(owner, name, type)
{
	var sql     = 'select status from dba_objects where owner = upper(:owner) and  object_name = upper(:name) and object_type = upper(:type)'; 
	var binds   = { }; 
	    binds.owner = owner;
		binds.name = name;
		binds.type = type;
	var status = oraInstaller.sysutil.executeReturnOneCol(sql, binds);
	return status;
}

oraInstaller.check_locked=function(username)
{
	var sql     = 'select account_status from dba_users where username = upper(:username)';
	var binds   = { }; 
	    binds.username = username;
	var status = oraInstaller.sysutil.executeReturnOneCol(sql, binds);
	return status;
}

oraInstaller.checkupdateversie=function(fileversion, dbversion,kitversion )
{
    if (oraInstaller.compare(fileversion, dbversion) >= 0 && oraInstaller.compare(dbversion, kitversion) <= 0)
	{   
       return true;
	}
	else 
	{
	   return false;
	}
}

oraInstaller.compare=function(a,b)
{
    if (a === b) {
       return 0;
    }
	
	if (a.length != b.length)
	{
	    if (b.startsWith(a))
		{
		    return 0;
		}
	}

    var a_components = a.split(".");
    var b_components = b.split(".");

    var len = Math.min(a_components.length, b_components.length);

    // loop while the components are equal
    for (var i = 0; i < len; i++) {
        // A bigger than B
        if (parseInt(a_components[i]) > parseInt(b_components[i])) {
            return 1;
        }

        // B bigger than A
        if (parseInt(a_components[i]) < parseInt(b_components[i])) {
            return -1;
        }
    }

    // If one's a prefix of the other, the longer one is greater.
    if (a_components.length > b_components.length) {
        return 1;
    }

    if (a_components.length < b_components.length) {
        return -1;
    }

    // Otherwise they are the same.
    return 0;
}

oraInstaller.readkitversie=function()
{
    var versiefile = oraInstaller.appl_home + '/' + 'versie.txt'
    var lines = {} ;
    var path = java.nio.file.FileSystems.getDefault().getPath(versiefile)
    lines = java.nio.file.Files.readAllLines(path);
    oraInstaller.versiekit = lines[0];
}

ctx.write('Begin aanroep functies\n');
oraInstaller.omgeving = oraInstaller.bepaalomgeving(oraInstaller.appl);
oraInstaller.owner    = oraInstaller.bepaalowner(oraInstaller.appl);
oraInstaller.locked   = oraInstaller.check_locked(oraInstaller.owner);
oraInstaller.set_proxy(oraInstaller.installuser, oraInstaller.owner, oraInstaller.lees, oraInstaller.adm, oraInstaller.mut)
ctx.write('Omgeving bepalen voor: ' + oraInstaller.appl + ': ' + oraInstaller.omgeving + '\n');
ctx.write('Owner bepalen voor   : ' + oraInstaller.appl + ': ' +  oraInstaller.owner + '\n');
ctx.write('Owner is             : ' + oraInstaller.locked + '\n');

oraInstaller.url     = conn.getMetaData().getURL();
ctx.write('url = '+ oraInstaller.url + '\n');
	

try {  
   if (oraInstaller.owncon != null && oraInstaller.owncon.isProxySession())
   {
       oraInstaller.owncon.close(OracleConnection.PROXY_SESSION); 
   }
   if (oraInstaller.owncon == null)
   {
     
   }
} 
catch (e)
{
   ctx.write('\nError during connect: '+e+'\n');
}
try {

   oraInstaller.properties.put("PROXY_USER_NAME", oraInstaller.owner);  
   oraInstaller.owncon = oraInstaller.DriverManager.getConnection(oraInstaller.url, oraInstaller.installuser, oraInstaller.installpwd);
   oraInstaller.owncon.openProxySession(OracleConnection.PROXYTYPE_USER_NAME, oraInstaller.properties);
   oraInstaller.ownutil = DBUtil.getInstance(oraInstaller.owncon);
   oraInstaller.scriptexecown = new oraInstaller.ScriptExecutor(oraInstaller.owncon);
   ctx.write('Is syscon proxy: '+ oraInstaller.syscon.isProxySession() + '\n');
   ctx.write('Is owncon proxy: '+ oraInstaller.owncon.isProxySession() + '\n');
}
catch (e)
{
   ctx.write('\nError during proxy connect: ' + e + '\n');
}
   
oraInstaller.versie= oraInstaller.checkversion(oraInstaller.appl);

ctx.write('Versie: ' + oraInstaller.versie + '\n');
oraInstaller.readkitversie();
ctx.write('Kit Versie: '+ oraInstaller.versiekit + '\n');


// check if install_dir is a directory 
if (java.nio.file.Files.isDirectory(java.nio.file.FileSystems.getDefault().getPath(oraInstaller.install_dir)))
{
    ctx.write('Dit is een directory: '+ oraInstaller.install_dir + '\n');
	
	var imports = new JavaImporter(java.nio.file);
	with (imports)
	{
	   // var Path       = Java.type("java.nio.file.Path");
       // var files      = new Path();
	   var files = {};
       oraInstaller.install_files = new java.io.File(oraInstaller.install_dir).list();
	   
	   for (i=0; i < oraInstaller.install_files.length; i++)
       {
           ctx.write(oraInstaller.install_files[i] + '\n');
       }
	}
}
else
{

}
oraInstaller.versie = '0.0.0.0';
oraInstaller.versiekit = '0.1.0.19';
if (oraInstaller.versie == null)
{
   // Hier doen we een nieuwe install
   // Daarna zetten we de oraInstaller.versie op '0.0.0.0' zodat de update scripts wel gedraaid gaan worden
   ctx.write('Ga uitvoeren: \n');
   oraInstaller.versie = '0.0.0.0';
}
// Nu gaan we de update scripts uitrollen
// We gaan door alle scripts 
for (i=0; i <oraInstaller.install_files.length; i++)
{
    ctx.write('Check: ' + oraInstaller.install_files[i] + '\n');
    if (oraInstaller.install_files[i].startsWith(oraInstaller.update_prefix))
	{
	   // We hebben een update script gevonden, maar moet dat uitgevoerd worden?
	   // Haal het versie nummer van de script naam en ga dan vergelijken.
	   var file_attr = oraInstaller.install_files[i].split('_');
	   if (oraInstaller.checkupdateversie(file_attr[2], oraInstaller.versie, oraInstaller.versiekit))
	   {
	      // Dit gaat nu geinstalleerd worden.
		  // Lees de file in en ga dan elke regel af omdat script uit te voeren
		  ctx.write('Ga uitvoeren: ' + oraInstaller.install_files[i] + '\n');
          var lines = {} ;
          var path = java.nio.file.FileSystems.getDefault().getPath(oraInstaller.install_dir + '/' + oraInstaller.install_files[i])
          lines = java.nio.file.Files.readAllLines(path);
          for (l=0; l < lines.length; l++)
		  {
		      if (lines[l].startsWith('#'))
			  {
			     continue;
			  }
		      var cmds = lines[l].split(' "');
			  ctx.write('Uitvoeren: '+ cmds[1] +'\n');
			  
			  var cmd = oraInstaller.replacevars(cmds[1]);
			  cmd = java.nio.file.FileSystems.getDefault().getPath(cmd);
			  ctx.write('Uitvoeren: '+ cmd);
			  oraInstaller.scriptexecown.setStmt('WHENEVER SQLERROR EXIT');
			  oraInstaller.scriptexecown.run();	
			  oraInstaller.scriptexecown.setStmt('@' + cmd);
			  oraInstaller.scriptexecown.run();
			  
			  var ctx1 = oraInstaller.scriptexecown.getScriptRunnerContext();
			  if (ctx1.getProperty("sqldev.error"))
              {
                 ctx.write('ERROR:  TRUE\n');
			  }
			  else
			  {
                 ctx.write('ERROR:  FALSE\n');			  
			  }
		  }
	   }	   
	}
}







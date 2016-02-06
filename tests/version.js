// This is run from SQLcl with javascript

// Test the different version number
ctx.write('1.0.0.0 = 1.0.0.0  => 0' + oraInstaller.compare('1.0.0.0', '1.0.0.0'));
ctx.write('1.0.0.0 = 1.0.0  ' + oraInstaller.compare('1.0.0.0', '1.0.0'));
ctx.write('1.0.0   = 1.0.0.0' + oraInstaller.compare('1.0.0', '1.0.0.0'));
ctx.write('1.0.0.1 = 1.0.0.0' + oraInstaller.compare('1.0.0.0', '1.0.0.0'));
ctx.write('1.0.0.1 = 0.0.0.0' + oraInstaller.compare('1.0.0.0', '1.0.0.0'));
ctx.write('1.0.0.0 = 1.0.0.0' + oraInstaller.compare('1.0.0.0', '1.0.0.0'));

import { mapLevelCodeToNumber, matchesClassesAttended, matchesChanting } from '../src/app/api/assignments/auto/route';
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('================================================================================');
  console.log('      UNIT & INTEGRATION TESTS: AUTO-ASSIGN FILTERS & OPERATORS SOURCE');
  console.log('================================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, details?: unknown) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (details) console.error('  Details:', details);
    }
  }

  // 1. Level Mapping tests
  console.log('--- 1. Testing mapLevelCodeToNumber ---');
  assert(mapLevelCodeToNumber('level-0') === 0, 'level-0 maps to 0');
  assert(mapLevelCodeToNumber('level-1') === 1, 'level-1 maps to 1');
  assert(mapLevelCodeToNumber('level-2') === 2, 'level-2 maps to 2');
  assert(mapLevelCodeToNumber('level-3') === 3, 'level-3 maps to 3');
  assert(mapLevelCodeToNumber('level-4') === 4, 'level-4 maps to 4');
  assert(mapLevelCodeToNumber(null) === 0, 'null maps to 0');
  assert(mapLevelCodeToNumber(undefined) === 0, 'undefined maps to 0');
  assert(mapLevelCodeToNumber('') === 0, 'empty string maps to 0');
  assert(mapLevelCodeToNumber('invalid') === 0, 'invalid level maps to 0');
  assert(mapLevelCodeToNumber('level-10') === 10, 'level-10 maps to 10');

  // 2. Classes Attended Filter tests
  console.log('\n--- 2. Testing matchesClassesAttended ---');
  assert(matchesClassesAttended(0, 'All') === true, 'All matches 0');
  assert(matchesClassesAttended(15, 'All') === true, 'All matches 15');
  assert(matchesClassesAttended(0, '0') === true, '0 matches 0');
  assert(matchesClassesAttended(1, '0') === false, '0 rejects 1');
  assert(matchesClassesAttended(null, '0') === true, 'null classes matches 0 filter');
  assert(matchesClassesAttended(1, '1-10') === true, '1-10 matches 1');
  assert(matchesClassesAttended(10, '1-10') === true, '1-10 matches 10');
  assert(matchesClassesAttended(0, '1-10') === false, '1-10 rejects 0');
  assert(matchesClassesAttended(11, '1-10') === false, '1-10 rejects 11');
  assert(matchesClassesAttended(11, '11-20') === true, '11-20 matches 11');
  assert(matchesClassesAttended(20, '11-20') === true, '11-20 matches 20');
  assert(matchesClassesAttended(10, '11-20') === false, '11-20 rejects 10');
  assert(matchesClassesAttended(21, '11-20') === false, '11-20 rejects 21');
  assert(matchesClassesAttended(21, '21+') === true, '21+ matches 21');
  assert(matchesClassesAttended(50, '21+') === true, '21+ matches 50');
  assert(matchesClassesAttended(20, '21+') === false, '21+ rejects 20');

  // 3. Chanting Filter tests
  console.log('\n--- 3. Testing matchesChanting ---');
  assert(matchesChanting(0, 'All') === true, 'All matches 0 chanting');
  assert(matchesChanting(16, 'All') === true, 'All matches 16 chanting');
  assert(matchesChanting(0, '0') === true, '0 matches 0 chanting');
  assert(matchesChanting(null, '0') === true, 'null matches 0 chanting');
  assert(matchesChanting(1, '0') === false, '0 rejects 1 chanting');
  assert(matchesChanting(1, '1+') === true, '1+ matches 1 chanting');
  assert(matchesChanting(3, '1+') === true, '1+ matches 3 chanting');
  assert(matchesChanting(0, '1+') === false, '1+ rejects 0 chanting');
  assert(matchesChanting(4, '4+') === true, '4+ matches 4 chanting');
  assert(matchesChanting(3, '4+') === false, '4+ rejects 3 chanting');
  assert(matchesChanting(8, '8+') === true, '8+ matches 8 chanting');
  assert(matchesChanting(7, '8+') === false, '8+ rejects 7 chanting');
  assert(matchesChanting(16, '16+') === true, '16+ matches 16 chanting');
  assert(matchesChanting(32, '16+') === true, '16+ matches 32 chanting');
  assert(matchesChanting(15, '16+') === false, '16+ rejects 15 chanting');

  // 4. Contacts Register UI strings test
  console.log('\n--- 4. Testing Contacts Register UI Strings ---');
  const regFormPath = path.join(process.cwd(), 'src/components/contacts-register-form.tsx');
  const regFormContent = fs.readFileSync(regFormPath, 'utf8');
  assert(regFormContent.includes('Bhajan Club'), 'contacts-register-form contains "Bhajan Club" title');
  assert(regFormContent.includes('Hare Krishna Heritage Tower, Kokapet'), 'contacts-register-form contains "Hare Krishna Heritage Tower, Kokapet" subtitle');

  const regPagePath = path.join(process.cwd(), 'src/app/contacts-register/page.tsx');
  const regPageContent = fs.readFileSync(regPagePath, 'utf8');
  assert(regPageContent.includes('Bhajan Club'), 'contacts-register/page contains "Bhajan Club"');
  assert(regPageContent.includes('Hare Krishna Heritage Tower, Kokapet'), 'contacts-register/page contains "Hare Krishna Heritage Tower, Kokapet"');

  // 5. Operators Source Restriction audit
  console.log('\n--- 5. Testing Operators Source Restriction ---');
  const opsPagePath = path.join(process.cwd(), 'src/app/admin/operators/page.tsx');
  const opsPageContent = fs.readFileSync(opsPagePath, 'utf8');
  assert(!opsPageContent.includes('useFestival()'), 'Operators page does NOT use useFestival() to switch sources');
  assert(opsPageContent.includes("contactSource: ContactSource = 'master_dashboard'"), 'Operators page locks contactSource to master_dashboard');
  assert(opsPageContent.includes('Active Source: {sourceTitle}'), 'Operators page displays Active Source: {sourceTitle}');
  assert(opsPageContent.includes("const sourceTitle = 'Master Dashboard';"), 'Operators page defines sourceTitle as Master Dashboard');

  console.log(`\n================================================================================`);
  console.log(`Tests Completed: ${passed}/${total} Passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`================================================================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

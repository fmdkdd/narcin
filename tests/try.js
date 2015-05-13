try {
  print(1);
  throw 2;
} catch (e if e === 2){
  print(2);
} finally {
  print(3);
}

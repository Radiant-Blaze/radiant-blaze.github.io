from pwn import xor

cipher = bytes.fromhex( "0e0b213f26041e480b26217f27342e175d0e070a3c5b103e2526217f27342e175d0e077e263451150104" )

# MyXORkey_QHOme$~seGbGURNdFWg)a|=TM!an        after xoring with Crypto{   ; we can say key = MyXORkey 
key = b"myXORkey"

flag = xor(cipher, key)
print(flag)
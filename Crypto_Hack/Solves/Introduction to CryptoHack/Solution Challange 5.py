from Cryptodome.Util.number import *

encoded_message = 11515195063862318899931685488813747395775516287289682636499965282714637259206269
decoded_message = long_to_bytes( encoded_message )

print("encoded message : " , encoded_message)
print("decoded message : " , decoded_message)
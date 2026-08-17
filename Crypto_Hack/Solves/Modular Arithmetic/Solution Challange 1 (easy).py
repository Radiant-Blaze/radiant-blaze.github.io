from math import gcd

def coprime_chk(a,b):
    remainder = gcd(a,b)
    
    if(remainder == 1):
        return "They are coprime"
    else:
        return "They are not coprime"
    
def line(a,b):
    print( "GCD of " , a , " and " , b , "\t = " , gcd(a,b) , "\t and " , coprime_chk(a,b) , "\n" )

a = 12
b = 8

line(a,b)

a = 11
b = 17

line(a,b)

a = 12
b = 8

line(a,b)

a = 66528
b = 52920

line(a,b)

print("Think about the case for a prime and b>a, why are these not necessarily coprime?")
print("Becauese if b is divisible by a or it's cofactor it will not be a coprime")
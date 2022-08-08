using System.Collections;
using System.Collections.Generic;
using OVR.OpenVR;
using UnityEditor;
using UnityEngine;

public class Gun : MonoBehaviour
{

    public AudioClip hapticAudioClip;
    public AudioSource source;
    public AudioClip laserSound;
    public GameObject laser;
    public Transform barrelLocation;

    private float _fireRate = 0.5f;
    private float _nextFire = 0.0f;

    public float shootPower;
    private bool _triggerDown = false;


    // Start is called before the first frame update
    void Start()
    {
        if (barrelLocation == null) barrelLocation = transform;

    }

    // Update is called once per frame
    void Update()
    {
        CheckIfTrigger();
        Shoot();
    }

    private void CheckIfTrigger()
    {
        Debug.Log("checking for trigger");
        if (OVRInput.GetDown(OVRInput.Button.PrimaryIndexTrigger, OVRInput.Controller.RTouch))
        {
            Debug.Log("Triggered!");
            _triggerDown = true;
        }
        if (OVRInput.GetUp(OVRInput.Button.PrimaryIndexTrigger, OVRInput.Controller.RTouch))
        {
            _triggerDown = false;
        }

    }

    private void Shoot()
    {
        if (_triggerDown && Time.time > _nextFire)
        {
            _nextFire = Time.time + _fireRate;
            Instantiate(laser, barrelLocation.position, barrelLocation.rotation * Quaternion.Euler(90f, 0f,0f)).GetComponent<Rigidbody>().AddForce(barrelLocation.forward * shootPower);
            source.PlayOneShot(laserSound);

            OVRHapticsClip hapticsClip = new OVRHapticsClip(hapticAudioClip);

            OVRHaptics.RightChannel.Preempt(hapticsClip);


        }

    }


}
